#!/usr/bin/env python
"""Build the JARVIS voice profile for VoiceStudio from a folder of raw film audio.

Runs INSIDE the VoiceStudio uv environment (scripts/build-jarvis-voice.ps1 does
that for you) because everything it needs ships there already: torch+CUDA,
demucs, faster-whisper, speechbrain, soundfile, httpx.

Pipeline (every stage caches to --out so re-runs are cheap):
  1. separate   demucs htdemucs → vocals / accompaniment stems per source
  2. segment    faster-whisper word timestamps → 2.5–12 s utterances
  3. clip       export each utterance (original mix when it is already clean,
                otherwise the vocals stem), with a cleanliness SNR in dB
  4. identify   speechbrain ECAPA speaker embeddings; the anchor sources
                (--anchor, pure-JARVIS audio) define the target voice and every
                clip is scored by cosine similarity to that centroid, so Tony
                Stark / Ultron / trailer narrators are filtered out
  5. profiles   top candidates become VoiceStudio clone profiles (transcript
                supplied, so no ASR model is needed inside VoiceStudio)
  6. audition   each profile speaks a fixed line; the output is transcribed
                (WER) and re-embedded (similarity to the anchor). Best becomes
                "<profile>", the rest "<profile> alt 2..N" so you can switch by
                name in jarvis.config.json.

Nothing here is committed: the clips are film audio.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf

# Piped stdout on Windows defaults to the locale codepage, which cannot encode
# the arrows/dashes below and would kill the run mid-stage (VoiceStudio's own
# setup.py carries the same guard).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

# faster-whisper (CTranslate2) wants cuDNN 8 while torch 2.8 ships cuDNN 9.
# VoiceStudio's setup.py stages the 8.x DLLs in site-packages/cudnn8_compat and
# its backend registers them at runtime (backend/core/cudnn8.py); do the same
# here or WhisperModel dies with "Could not locate cudnn_ops_infer64_8.dll".
_DLL_HANDLES: list[object] = []
if sys.platform == "win32":
    import os

    for _lib in (
        Path(sys.prefix) / "Lib" / "site-packages" / "cudnn8_compat" / "nvidia" / "cudnn" / "bin",
        Path(sys.prefix) / "Lib" / "site-packages" / "nvidia" / "cudnn" / "bin",
        Path(sys.prefix) / "Lib" / "site-packages" / "nvidia" / "cublas" / "bin",
    ):
        if _lib.is_dir():
            _DLL_HANDLES.append(os.add_dll_directory(str(_lib)))
            os.environ["PATH"] = f"{_lib}{os.pathsep}{os.environ.get('PATH', '')}"
            # Explicit preload too (what backend/core/cudnn8.py does): a DLL
            # already in the process satisfies cuDNN's own LoadLibrary by name.
            import ctypes
            import glob as _glob

            for _dll in sorted(_glob.glob(str(_lib / "cudnn*64_8.dll"))):
                try:
                    _DLL_HANDLES.append(ctypes.CDLL(_dll))
                except OSError as exc:
                    print(f"[voice-build] cudnn8 preload skipped {_dll}: {exc}", flush=True)

TEST_LINE = (
    "Good morning, sir. The workshop is at seventy two degrees, "
    "your inbox holds four flagged messages, and the suit is ready when you are."
)
WORD_RE = re.compile(r"[a-z0-9']+")


def log(msg: str) -> None:
    print(f"[voice-build] {msg}", flush=True)


# ---------------------------------------------------------------- audio utils
def load_mono(path: Path, sr: int) -> np.ndarray:
    import torch
    import torchaudio

    wav, s = torchaudio.load(str(path))
    if wav.shape[0] > 1:
        wav = wav.mean(dim=0, keepdim=True)
    if s != sr:
        wav = torchaudio.functional.resample(wav, s, sr)
    return wav[0].numpy().astype(np.float32)


def rms_db(x: np.ndarray) -> float:
    if x.size == 0:
        return -120.0
    r = float(np.sqrt(np.mean(np.square(x, dtype=np.float64))))
    return 20 * math.log10(max(r, 1e-7))


def peak_normalize(x: np.ndarray, peak_db: float = -1.0) -> np.ndarray:
    p = float(np.max(np.abs(x))) if x.size else 0.0
    if p <= 0:
        return x
    return (x * (10 ** (peak_db / 20) / p)).astype(np.float32)


def wer(ref: str, hyp: str) -> float:
    r = WORD_RE.findall(ref.lower())
    h = WORD_RE.findall(hyp.lower())
    if not r:
        return 1.0
    d = np.zeros((len(r) + 1, len(h) + 1), dtype=np.int32)
    d[:, 0] = np.arange(len(r) + 1)
    d[0, :] = np.arange(len(h) + 1)
    for i in range(1, len(r) + 1):
        for j in range(1, len(h) + 1):
            d[i, j] = min(d[i - 1, j] + 1, d[i, j - 1] + 1, d[i - 1, j - 1] + (r[i - 1] != h[j - 1]))
    return float(d[len(r), len(h)]) / len(r)


# ------------------------------------------------------------------ stage 1
def separate(raw: Path, stems: Path, device: str) -> list[tuple[str, Path, Path, Path]]:
    """Return [(source_id, mix_path, vocals_path, accompaniment_path)]."""
    from demucs.api import Separator, save_audio

    out: list[tuple[str, Path, Path, Path]] = []
    sources = sorted(p for p in raw.iterdir() if p.suffix.lower() in {".wav", ".mp3", ".m4a", ".webm", ".opus", ".flac"})
    if not sources:
        sys.exit(f"no audio in {raw}")
    sep = None
    for src in sources:
        sid = src.stem
        voc = stems / f"{sid}.vocals.wav"
        acc = stems / f"{sid}.acc.wav"
        if voc.exists() and acc.exists():
            out.append((sid, src, voc, acc))
            continue
        if sep is None:
            log(f"loading demucs htdemucs on {device}")
            sep = Separator(model="htdemucs", device=device, progress=False)
        t0 = time.time()
        log(f"separating {src.name}")
        _, parts = sep.separate_audio_file(src)
        save_audio(parts["vocals"], str(voc), samplerate=sep.samplerate)
        save_audio(parts["drums"] + parts["bass"] + parts["other"], str(acc), samplerate=sep.samplerate)
        log(f"  {sid}: stems in {time.time() - t0:.0f}s")
        out.append((sid, src, voc, acc))
    return out


# ------------------------------------------------------------------ stage 2
def transcribe_words(model, path: Path) -> list[dict]:
    segments, _ = model.transcribe(
        str(path), language="en", word_timestamps=True, vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 300},
        condition_on_previous_text=False,
    )
    words: list[dict] = []
    for seg in segments:
        for w in seg.words or []:
            if w.word.strip():
                words.append({"w": w.word.strip(), "s": float(w.start), "e": float(w.end), "p": float(w.probability)})
    return words


def utterances(words: list[dict], min_s: float, max_s: float, gap: float) -> list[dict]:
    out: list[dict] = []
    cur: list[dict] = []

    def flush() -> None:
        if not cur:
            return
        dur = cur[-1]["e"] - cur[0]["s"]
        if min_s <= dur <= max_s and len(cur) >= 4:
            out.append({"s": cur[0]["s"], "e": cur[-1]["e"], "text": " ".join(w["w"] for w in cur), "words": len(cur),
                        "conf": float(np.mean([w["p"] for w in cur]))})

    for w in words:
        if cur and (w["s"] - cur[-1]["e"] > gap or w["e"] - cur[0]["s"] > max_s):
            flush()
            cur = []
        cur.append(w)
    flush()
    return out


# ------------------------------------------------------------------ stage 3/4
def build_clips(stems_list, out: Path, args) -> list[dict]:
    from faster_whisper import WhisperModel

    clips_dir = out / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)
    catalog_path = out / "clips.json"
    catalog: list[dict] = json.loads(catalog_path.read_text()) if catalog_path.exists() else []
    done = {c["source"] for c in catalog}
    model = None
    for sid, mix_p, voc_p, acc_p in stems_list:
        if sid in done:
            continue
        if model is None:
            log(f"loading faster-whisper {args.whisper} on {args.device}")
            try:
                model = WhisperModel(args.whisper, device=args.device, compute_type="float16" if args.device == "cuda" else "int8")
            except Exception as exc:  # pragma: no cover
                log(f"  {args.whisper} unavailable ({exc}); falling back to medium.en")
                model = WhisperModel("medium.en", device=args.device, compute_type="float16" if args.device == "cuda" else "int8")
        log(f"transcribing {sid} (vocals stem)")
        words = transcribe_words(model, voc_p)
        utts = utterances(words, args.min_dur, args.max_dur, args.gap)
        log(f"  {sid}: {len(words)} words → {len(utts)} utterances")
        sr = args.sr
        mix = load_mono(mix_p, sr)
        voc = load_mono(voc_p, sr)
        acc = load_mono(acc_p, sr)
        for i, u in enumerate(utts):
            a = max(0, int((u["s"] - 0.15) * sr))
            b = min(len(voc), int((u["e"] + 0.25) * sr))
            if b - a < sr:
                continue
            snr = rms_db(voc[a:b]) - rms_db(acc[a:b])
            source_kind = "mix" if snr >= args.clean_snr else "vocals"
            audio = (mix if source_kind == "mix" else voc)[a:b]
            name = f"{sid}_{i:03d}.wav"
            sf.write(str(clips_dir / name), peak_normalize(audio), sr, subtype="PCM_16")
            catalog.append({
                "file": name, "source": sid, "start": round(u["s"], 2), "end": round(u["e"], 2),
                "dur": round((b - a) / sr, 2), "text": u["text"], "words": u["words"], "asr_conf": round(u["conf"], 3),
                "snr_db": round(snr, 1), "taken_from": source_kind,
            })
        catalog_path.write_text(json.dumps(catalog, indent=1))
    return catalog


def embed_clips(catalog: list[dict], out: Path, args) -> None:
    import torch
    from speechbrain.inference.speaker import EncoderClassifier

    need = [c for c in catalog if "emb" not in c]
    if not need:
        return
    log(f"embedding {len(need)} clips with ECAPA")
    enc = EncoderClassifier.from_hparams(
        source="speechbrain/spkrec-ecapa-voxceleb", savedir=str(out / "ecapa"), run_opts={"device": args.device},
    )
    for c in need:
        x = load_mono(out / "clips" / c["file"], 16000)
        with torch.no_grad():
            e = enc.encode_batch(torch.from_numpy(x)[None, :]).squeeze().cpu().numpy()
        c["emb"] = (e / (np.linalg.norm(e) + 1e-9)).round(5).tolist()
    (out / "clips.json").write_text(json.dumps(catalog, indent=1))


def embed_wav(path: Path, out: Path, device: str) -> np.ndarray:
    import torch
    from speechbrain.inference.speaker import EncoderClassifier

    enc = EncoderClassifier.from_hparams(
        source="speechbrain/spkrec-ecapa-voxceleb", savedir=str(out / "ecapa"), run_opts={"device": device},
    )
    x = load_mono(path, 16000)
    with torch.no_grad():
        e = enc.encode_batch(torch.from_numpy(x)[None, :]).squeeze().cpu().numpy()
    return e / (np.linalg.norm(e) + 1e-9)


def score_clips(catalog: list[dict], anchors: set[str], args) -> tuple[list[dict], np.ndarray]:
    E = np.array([c["emb"] for c in catalog])
    anchor_rows = [i for i, c in enumerate(catalog) if c["source"] in anchors and c["snr_db"] >= args.clean_snr]
    if anchor_rows:
        centroid = E[anchor_rows].mean(axis=0)
        log(f"anchor centroid from {len(anchor_rows)} clean clips of {sorted(anchors)}")
    else:
        # No anchor: take the densest clip as the seed (the speaker with the most lines).
        sims = E @ E.T
        seed = int(np.argsort(-(sims > 0.6).sum(axis=1))[0])
        centroid = E[seed]
        log(f"no anchor clips; seeding from {catalog[seed]['file']}")
    centroid /= np.linalg.norm(centroid) + 1e-9
    # One refinement pass: everything confidently the same speaker re-defines the voice.
    sims = E @ centroid
    keep = sims >= args.sim_keep
    if keep.sum() >= 5:
        centroid = E[keep].mean(axis=0)
        centroid /= np.linalg.norm(centroid) + 1e-9
        sims = E @ centroid
    for c, s in zip(catalog, sims):
        c["sim"] = round(float(s), 4)
        dur_pen = 0.0 if 4.0 <= c["dur"] <= 10.0 else 0.08
        snr_pen = 0.0 if c["snr_db"] >= args.clean_snr else min(0.15, (args.clean_snr - c["snr_db"]) * 0.01)
        c["score"] = round(float(s) - dur_pen - snr_pen + 0.01 * min(c["words"], 12) / 12, 4)
    ranked = sorted(catalog, key=lambda c: -c["score"])
    hist = np.histogram(sims, bins=[-1, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.01])[0].tolist()
    log(f"similarity histogram [<.3 .3 .4 .5 .6 .7 .8+]: {hist}")
    return ranked, centroid


# ------------------------------------------------------------------ stage 5/6
class VS:
    def __init__(self, url: str):
        import httpx

        self.c = httpx.Client(base_url=url.rstrip("/"), timeout=120)

    def health(self) -> bool:
        try:
            return self.c.get("/health").status_code == 200
        except Exception:
            return False

    def ensure_model(self, engine: str) -> None:
        models = self.c.get("/models").json()
        entries = models if isinstance(models, list) else models.get("models", models.get("items", []))
        entry = next((m for m in entries if engine in str(m.get("repo_id", "")).lower() or m.get("engine") == engine or m.get("id") == engine), None)
        if entry is None:
            log(f"model listing has no {engine} entry; relying on lazy download on first use")
            return
        if entry.get("installed"):
            log(f"model {entry['repo_id']} already installed")
            return
        log(f"installing model {entry['repo_id']} ({entry.get('size_gb') or entry.get('size') or '?'} )")
        r = self.c.post("/models/install", json={"repo_id": entry["repo_id"]})
        r.raise_for_status()
        while True:
            time.sleep(5)
            st = self.c.get("/models/install/status").json()
            jobs = st.get("jobs", st if isinstance(st, list) else [])
            if any(j.get("state") == "failed" or j.get("status") == "failed" for j in jobs):
                sys.exit(f"model install failed: {jobs}")
            if not jobs:
                models = self.c.get("/models").json()
                entries = models if isinstance(models, list) else models.get("models", models.get("items", []))
                if any(m.get("repo_id") == entry["repo_id"] and m.get("installed") for m in entries):
                    log("model installed")
                    return
            else:
                j = jobs[0]
                log(f"  download {j.get('progress') or j.get('percent') or ''} {j.get('state') or j.get('status') or ''}")

    def profiles(self) -> list[dict]:
        return self.c.get("/profiles").json()

    def upsert_profile(self, name: str, wav: Path, text: str) -> dict:
        existing = next((p for p in self.profiles() if p["name"].lower() == name.lower()), None)
        with open(wav, "rb") as f:
            files = {"ref_audio": (wav.name, f, "audio/wav")}
            if existing:
                r = self.c.put(f"/profiles/{existing['id']}/audio", files=files, data={"ref_text": text, "name": name})
            else:
                r = self.c.post("/profiles", files=files, data={"name": name, "ref_text": text, "language": "English", "kind": "clone"})
        r.raise_for_status()
        return r.json()

    def rename(self, pid: str, name: str) -> None:
        self.c.put(f"/profiles/{pid}", json={"name": name}).raise_for_status()

    def speak(self, voice: str, text: str, engine: str, dest: Path) -> float:
        t0 = time.time()
        r = self.c.post("/v1/audio/speech", json={"model": engine, "voice": voice, "input": text, "response_format": "wav"}, timeout=600)
        r.raise_for_status()
        dest.write_bytes(r.content)
        return time.time() - t0


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", type=Path, required=True, help="folder of downloaded source audio")
    ap.add_argument("--out", type=Path, required=True, help="work folder (stems, clips, report)")
    ap.add_argument("--anchor", action="append", default=[], help="source id(s) that are pure JARVIS audio")
    ap.add_argument("--vs-url", default="http://127.0.0.1:3900")
    ap.add_argument("--profile", default="JARVIS")
    ap.add_argument("--engine", default="omnivoice")
    ap.add_argument("--top", type=int, default=6, help="how many candidates to audition")
    ap.add_argument("--whisper", default="large-v3-turbo")
    ap.add_argument("--device", default="cuda")
    ap.add_argument("--sr", type=int, default=24000)
    ap.add_argument("--min-dur", type=float, default=2.5)
    ap.add_argument("--max-dur", type=float, default=12.0)
    ap.add_argument("--gap", type=float, default=0.55)
    ap.add_argument("--clean-snr", type=float, default=18.0, help="dB vocals-over-accompaniment to use the raw mix")
    ap.add_argument("--sim-keep", type=float, default=0.55)
    ap.add_argument("--no-profiles", action="store_true", help="stop after ranking clips")
    args = ap.parse_args()

    out: Path = args.out
    (out / "stems").mkdir(parents=True, exist_ok=True)
    stems_list = separate(args.raw, out / "stems", args.device)
    catalog = build_clips(stems_list, out, args)
    embed_clips(catalog, out, args)
    ranked, centroid = score_clips(catalog, set(args.anchor), args)
    (out / "ranked.json").write_text(json.dumps([{k: v for k, v in c.items() if k != "emb"} for c in ranked], indent=1))
    best_dir = out / "best"
    if best_dir.exists():
        shutil.rmtree(best_dir)
    best_dir.mkdir()
    cands = [c for c in ranked if c["sim"] >= args.sim_keep and c["words"] >= 6][: args.top]
    if not cands:
        sys.exit("no clip passed the speaker-similarity gate; lower --sim-keep or add --anchor sources")
    for i, c in enumerate(cands, 1):
        shutil.copy(out / "clips" / c["file"], best_dir / f"{i:02d}_{c['file']}")
    log("top candidates:")
    for i, c in enumerate(cands, 1):
        log(f"  {i:2d}. sim={c['sim']:.3f} snr={c['snr_db']:5.1f}dB {c['dur']:4.1f}s [{c['taken_from']}] {c['source']} @{c['start']}: {c['text'][:70]}")
    if args.no_profiles:
        return

    vs = VS(args.vs_url)
    if not vs.health():
        sys.exit(f"VoiceStudio not answering at {args.vs_url}")
    vs.ensure_model(args.engine)

    audition = out / "audition"
    audition.mkdir(exist_ok=True)
    from faster_whisper import WhisperModel

    asr = WhisperModel("medium.en", device=args.device, compute_type="float16" if args.device == "cuda" else "int8")
    results = []
    for i, c in enumerate(cands, 1):
        tmp_name = f"{args.profile} cand {i}"
        prof = vs.upsert_profile(tmp_name, out / "clips" / c["file"], c["text"])
        wav = audition / f"cand{i}.wav"
        secs = vs.speak(prof["id"], TEST_LINE, args.engine, wav)
        segs, _ = asr.transcribe(str(wav), language="en")
        hyp = " ".join(s.text for s in segs).strip()
        e = embed_wav(wav, out, args.device)
        sim_out = float(e @ centroid)
        w = wer(TEST_LINE, hyp)
        results.append({"cand": i, "profile_id": prof["id"], "ref": c["file"], "ref_sim": c["sim"], "ref_snr": c["snr_db"],
                        "ref_text": c["text"], "gen_seconds": round(secs, 1), "out_sim": round(sim_out, 4), "wer": round(w, 3), "heard": hyp})
        log(f"  cand {i}: out_sim={sim_out:.3f} wer={w:.2f} gen={secs:.1f}s heard='{hyp[:60]}'")
    # Intelligibility first (a clone that mumbles is useless), then likeness.
    results.sort(key=lambda r: (r["wer"] > 0.25, -(r["out_sim"] - 0.5 * r["wer"])))
    for rank, r in enumerate(results, 1):
        name = args.profile if rank == 1 else f"{args.profile} alt {rank}"
        vs.rename(r["profile_id"], name)
        r["name"] = name
    report = out / "report.md"
    lines = [f"# JARVIS voice build — {time.strftime('%Y-%m-%d %H:%M')}", "",
             f"Sources: {len(stems_list)} · clips: {len(catalog)} · auditioned: {len(results)}", "",
             "| rank | profile | out sim | WER | ref sim | ref SNR dB | ref clip | ref line |", "|---|---|---|---|---|---|---|---|"]
    for rank, r in enumerate(results, 1):
        lines.append(f"| {rank} | {r['name']} | {r['out_sim']:.3f} | {r['wer']:.2f} | {r['ref_sim']:.3f} | {r['ref_snr']:.1f} | {r['ref']} | {r['ref_text'][:60]} |")
    lines += ["", f"Test line: {TEST_LINE}", "", "Audition WAVs: " + str(audition)]
    report.write_text("\n".join(lines), encoding="utf-8")
    (out / "audition.json").write_text(json.dumps(results, indent=1))
    log(f"winner → profile '{args.profile}' ({results[0]['profile_id']}); report at {report}")


if __name__ == "__main__":
    main()
