"""Wake-word + push-to-talk sidecar for jarvis-core.

Owns the microphone: listens for "hey jarvis" (openWakeWord pretrained model)
AND for a hold-to-talk key (default F8) — both always active. Records the
utterance (two-phase endpointing for wake; key-release for PTT) and hands the
WAV to jarvis-core over localhost HTTP. Deliberately dumb — STT, routing, and
TTS all live in jarvis-core.

Events posted to --core (default http://127.0.0.1:8723):
  POST /voice/heartbeat  {"ok": bool, "reason": str}   every 15s
  POST /voice/wake       (empty)                        wake word or PTT press
  POST /voice/utterance?src=wake|ptt  (audio/wav body)  after endpointing

Mute (Jarvis-only, never the device): GET /voice/control is polled ~1s; while
{"muted": true} the input stream is CLOSED — the mic is released back to the
OS and nothing is captured. Hold-to-talk still works muted (explicit intent):
a stream is opened just for the hold, then closed again.

Utilities:
  --list-devices        print input devices and exit
  --device <n | name>   input device by index or case-insensitive name part
  --threshold <0..1>    wake-word score threshold (default 0.5)
  --ptt-key <key>       hold-to-talk key (default f8); "none" disables
  --send-wav file.wav   post one utterance and exit (test hook, no mic)
"""

import argparse
import io
import json
import sys
import threading
import time
import urllib.request
import wave

RATE = 16000
FRAME = 1280  # 80 ms — openWakeWord's expected step size
WAKE_THRESHOLD = 0.5
NEAR_MISS = 0.30
SILENCE_RMS = 500
SILENCE_SECONDS = 1.2
WAIT_FOR_SPEECH_SECONDS = 5.0  # grace period after the wake word before giving up
MAX_UTTERANCE_SECONDS = 12
WAKE_COOLDOWN_SECONDS = 2.0
MIN_PTT_SECONDS = 0.3


def post(url: str, data: bytes = b"", content_type: str = "application/json") -> None:
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", content_type)
    with urllib.request.urlopen(req, timeout=10):
        pass


class ControlPoller(threading.Thread):
    """Polls core for the Jarvis-only mute flag. Core down => keep last state."""

    def __init__(self, core: str):
        super().__init__(daemon=True)
        self.core = core
        self.muted = False

    def run(self) -> None:
        while True:
            try:
                with urllib.request.urlopen(f"{self.core}/voice/control", timeout=5) as r:
                    self.muted = bool(json.loads(r.read()).get("muted", False))
            except Exception:
                pass
            time.sleep(1)


class Heartbeat(threading.Thread):
    def __init__(self, core: str):
        super().__init__(daemon=True)
        self.core = core
        self.ok = True
        self.reason = ""

    def run(self) -> None:
        while True:
            try:
                body = json.dumps({"ok": self.ok, "reason": self.reason}).encode()
                post(f"{self.core}/voice/heartbeat", body)
            except Exception:
                pass  # core down — it will see the heartbeat gap anyway
            time.sleep(15)


def wav_bytes(pcm: bytes) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm)
    return buf.getvalue()


def rms(frame) -> float:
    import numpy as np

    samples = np.frombuffer(frame, dtype=np.int16).astype(np.float64)
    return float(np.sqrt(np.mean(samples * samples))) if samples.size else 0.0


def resolve_device(spec):
    """None → system default; int-ish → index; else name substring (input devices)."""
    import sounddevice as sd

    devices = sd.query_devices()
    if spec is None:
        idx = sd.default.device[0]
        return idx, devices[idx]["name"] if idx is not None and idx >= 0 else "system default"
    try:
        idx = int(spec)
        return idx, devices[idx]["name"]
    except ValueError:
        pass
    needle = spec.lower()
    for i, d in enumerate(devices):
        if d["max_input_channels"] > 0 and needle in d["name"].lower():
            return i, d["name"]
    raise SystemExit(f"no input device matching '{spec}' — try --list-devices")


def send_utterance(core: str, pcm: bytes, label: str) -> None:
    try:
        post(f"{core}/voice/utterance?src={label}", wav_bytes(pcm), "audio/wav")
        print(f"{label} utterance sent ({len(pcm) // 32} ms)")
    except Exception as e:
        print(f"utterance post failed: {e}", file=sys.stderr)


def notify_wake(core: str) -> None:
    try:
        post(f"{core}/voice/wake")
    except Exception as e:
        print(f"core unreachable on wake: {e}", file=sys.stderr)


def listen(core: str, device, threshold: float, ptt_key: str, hb: Heartbeat, ctl: ControlPoller) -> None:
    import sounddevice as sd
    from openwakeword.model import Model

    dev_index, dev_name = resolve_device(device)
    model = Model(wakeword_models=["hey_jarvis_v0.1"], inference_framework="onnx")
    wake_key = next(iter(model.models.keys()))

    ptt = {"down": False}
    if ptt_key and ptt_key.lower() != "none":
        try:
            import keyboard

            keyboard.on_press_key(ptt_key, lambda e: ptt.__setitem__("down", True), suppress=False)
            keyboard.on_release_key(ptt_key, lambda e: ptt.__setitem__("down", False), suppress=False)
            print(f"push-to-talk armed: hold {ptt_key.upper()}")
        except Exception as e:
            print(f"push-to-talk unavailable: {e}", file=sys.stderr)

    print(
        f"listening for wake word ({wake_key}, threshold {threshold}) "
        f"on mic [{dev_index}] {dev_name}"
    )

    # The stream is opened/closed around mute so the device is genuinely
    # released while muted (Jarvis-only — other apps see a free mic always).
    mic = {"stream": None}

    def open_mic():
        if mic["stream"] is None:
            s = sd.InputStream(
                samplerate=RATE, channels=1, dtype="int16", blocksize=FRAME, device=dev_index
            )
            s.start()
            mic["stream"] = s
        return mic["stream"]

    def close_mic() -> None:
        s = mic["stream"]
        if s is not None:
            mic["stream"] = None
            try:
                s.stop()
                s.close()
            except Exception:
                pass

    open_mic()
    hb.ok, hb.reason = True, f"mic: {dev_name}"
    last_wake = 0.0
    last_miss_log = 0.0
    announced_mute = False

    def record_wake_utterance() -> bytes | None:
        """Two-phase: wait for speech to begin, then endpoint on silence."""
        chunks: list[bytes] = []
        speech_started = False
        silent_for = 0.0
        started = time.monotonic()
        while time.monotonic() - started < MAX_UTTERANCE_SECONDS:
            f2, _ = mic["stream"].read(FRAME)
            raw = f2[:, 0].tobytes()
            chunks.append(raw)
            loud = rms(raw) >= SILENCE_RMS
            if not speech_started:
                if loud:
                    speech_started = True
                elif time.monotonic() - started > WAIT_FOR_SPEECH_SECONDS:
                    return None  # they never spoke
                continue
            if loud:
                silent_for = 0.0
            else:
                silent_for += FRAME / RATE
                if silent_for >= SILENCE_SECONDS:
                    break
        return b"".join(chunks) if speech_started else None

    def record_ptt_utterance() -> bytes:
        """Record while the key is held, plus a short tail."""
        chunks: list[bytes] = []
        started = time.monotonic()
        while ptt["down"] and time.monotonic() - started < MAX_UTTERANCE_SECONDS * 2:
            f2, _ = mic["stream"].read(FRAME)
            chunks.append(f2[:, 0].tobytes())
        for _ in range(4):  # ~0.3s tail so the last word isn't clipped
            f2, _ = mic["stream"].read(FRAME)
            chunks.append(f2[:, 0].tobytes())
        return b"".join(chunks)

    while True:
        if ctl.muted:
            if mic["stream"] is not None and not ptt["down"]:
                close_mic()
                if not announced_mute:
                    announced_mute = True
                    print("muted — mic released (hold-to-talk still armed)")
                hb.ok, hb.reason = True, "muted"
            if ptt["down"]:
                print("ptt (muted): recording")
                open_mic()
                notify_wake(core)
                pcm = record_ptt_utterance()
                close_mic()
                if len(pcm) >= int(MIN_PTT_SECONDS * RATE * 2):
                    send_utterance(core, pcm, "ptt")
                else:
                    print("ptt too short — discarded")
            time.sleep(0.05)
            continue
        if mic["stream"] is None:
            open_mic()
            model.reset()
            announced_mute = False
            hb.ok, hb.reason = True, f"mic: {dev_name}"
            print(f"unmuted — listening again on [{dev_index}] {dev_name}")

        if ptt["down"]:
            print("ptt: recording")
            notify_wake(core)
            pcm = record_ptt_utterance()
            if len(pcm) >= int(MIN_PTT_SECONDS * RATE * 2):
                send_utterance(core, pcm, "ptt")
            else:
                print("ptt too short — discarded")
            model.reset()
            continue

        frame, _ = mic["stream"].read(FRAME)
        mono = frame[:, 0]
        scores = model.predict(mono)
        score = scores.get(wake_key, 0.0)
        if score >= NEAR_MISS and score < threshold and time.monotonic() - last_miss_log > 1.0:
            last_miss_log = time.monotonic()
            print(f"wake near-miss ({score:.2f} < {threshold}) — speak closer or lower threshold")
        if score < threshold or time.monotonic() - last_wake < WAKE_COOLDOWN_SECONDS:
            continue

        last_wake = time.monotonic()
        print(f"wake ({score:.2f}) — recording")
        notify_wake(core)
        pcm = record_wake_utterance()
        model.reset()
        if pcm is None:
            print("no speech after wake — discarded")
            continue
        send_utterance(core, pcm, "wake")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--core", default="http://127.0.0.1:8723")
    ap.add_argument("--device", default=None, help="input index or name substring")
    ap.add_argument("--threshold", type=float, default=WAKE_THRESHOLD)
    ap.add_argument("--ptt-key", default="f8", help="hold-to-talk key; 'none' disables")
    ap.add_argument("--list-devices", action="store_true")
    ap.add_argument("--send-wav", help="post this WAV as one utterance and exit (test hook)")
    args = ap.parse_args()

    if args.list_devices:
        import sounddevice as sd

        default_in = sd.default.device[0]
        for i, d in enumerate(sd.query_devices()):
            if d["max_input_channels"] > 0:
                mark = "  <= default" if i == default_in else ""
                print(f"[{i}] {d['name']}{mark}")
        return 0

    if args.send_wav:
        with open(args.send_wav, "rb") as f:
            post(f"{args.core}/voice/utterance", f.read(), "audio/wav")
        print("sent")
        return 0

    hb = Heartbeat(args.core)
    hb.start()
    ctl = ControlPoller(args.core)
    ctl.start()
    while True:
        try:
            listen(args.core, args.device, args.threshold, args.ptt_key, hb, ctl)
        except Exception as e:
            hb.ok, hb.reason = False, f"mic/listen error: {e}"
            print(f"listen loop failed: {e} — retrying in 30s", file=sys.stderr)
            time.sleep(30)


if __name__ == "__main__":
    sys.exit(main())
