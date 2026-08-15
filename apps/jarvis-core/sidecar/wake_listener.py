"""Wake-word sidecar for jarvis-core (Phase 3).

Owns the microphone: listens for "hey jarvis" (openWakeWord pretrained model),
records the utterance that follows (energy-based endpointing), and hands the
WAV to jarvis-core over localhost HTTP. Deliberately dumb — STT, routing, and
TTS all live in jarvis-core.

Events posted to --core (default http://127.0.0.1:8723):
  POST /voice/heartbeat  {"ok": bool, "reason": str}   every 15s
  POST /voice/wake       (empty)                        on wake-word hit
  POST /voice/utterance  (audio/wav body)               after endpointing

Test hook (no mic involved): --send-wav file.wav posts one utterance and exits.
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
SILENCE_RMS = 500
SILENCE_SECONDS = 1.2
WAIT_FOR_SPEECH_SECONDS = 5.0  # grace period after the wake word before giving up
MAX_UTTERANCE_SECONDS = 12
WAKE_COOLDOWN_SECONDS = 2.0


def post(url: str, data: bytes = b"", content_type: str = "application/json") -> None:
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", content_type)
    with urllib.request.urlopen(req, timeout=10):
        pass


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


def listen(core: str, device, threshold: float, hb: Heartbeat) -> None:
    import numpy as np
    import sounddevice as sd
    from openwakeword.model import Model

    model = Model(wakeword_models=["hey_jarvis_v0.1"], inference_framework="onnx")
    wake_key = next(iter(model.models.keys()))
    print(f"listening for wake word ({wake_key}), device={device if device is not None else 'default'}")

    stream = sd.InputStream(
        samplerate=RATE, channels=1, dtype="int16", blocksize=FRAME, device=device
    )
    stream.start()
    hb.ok, hb.reason = True, ""
    last_wake = 0.0

    while True:
        frame, _ = stream.read(FRAME)
        mono = frame[:, 0]
        scores = model.predict(mono)
        if scores.get(wake_key, 0.0) < threshold or time.monotonic() - last_wake < WAKE_COOLDOWN_SECONDS:
            continue

        last_wake = time.monotonic()
        print(f"wake ({scores[wake_key]:.2f}) — recording")
        try:
            post(f"{core}/voice/wake")
        except Exception as e:
            print(f"core unreachable on wake: {e}", file=sys.stderr)

        # Two-phase endpointing: first WAIT for speech to begin (people pause
        # after the wake word — the silence rule must not start counting until
        # they've actually said something), then record until sustained
        # silence or the cap.
        chunks: list[bytes] = []
        speech_started = False
        silent_for = 0.0
        started = time.monotonic()
        while time.monotonic() - started < MAX_UTTERANCE_SECONDS:
            f2, _ = stream.read(FRAME)
            raw = f2[:, 0].tobytes()
            chunks.append(raw)
            loud = rms(raw) >= SILENCE_RMS
            if not speech_started:
                if loud:
                    speech_started = True
                elif time.monotonic() - started > WAIT_FOR_SPEECH_SECONDS:
                    break  # they never spoke
                continue
            if loud:
                silent_for = 0.0
            else:
                silent_for += FRAME / RATE
                if silent_for >= SILENCE_SECONDS:
                    break

        model.reset()
        pcm = b"".join(chunks)
        if not speech_started:
            print("no speech after wake — discarded")
            continue
        try:
            post(f"{core}/voice/utterance", wav_bytes(pcm), "audio/wav")
            print(f"utterance sent ({len(pcm) // 32} ms)")
        except Exception as e:
            print(f"utterance post failed: {e}", file=sys.stderr)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--core", default="http://127.0.0.1:8723")
    ap.add_argument("--device", type=int, default=None, help="sounddevice input index")
    ap.add_argument("--threshold", type=float, default=WAKE_THRESHOLD)
    ap.add_argument("--send-wav", help="post this WAV as one utterance and exit (test hook)")
    args = ap.parse_args()

    if args.send_wav:
        with open(args.send_wav, "rb") as f:
            post(f"{args.core}/voice/utterance", f.read(), "audio/wav")
        print("sent")
        return 0

    hb = Heartbeat(args.core)
    hb.start()
    while True:
        try:
            listen(args.core, args.device, args.threshold, hb)
        except Exception as e:
            hb.ok, hb.reason = False, f"mic/listen error: {e}"
            print(f"listen loop failed: {e} — retrying in 30s", file=sys.stderr)
            time.sleep(30)


if __name__ == "__main__":
    sys.exit(main())
