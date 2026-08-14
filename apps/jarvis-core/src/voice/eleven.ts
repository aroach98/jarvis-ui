import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ConnectorStatus } from "@jarvis-ui/shared";
import { getEnv } from "../lib/env.js";

/**
 * Pro-mode cloud TTS via ElevenLabs — only invoked while the cost toggle is
 * on "pro". Default voice is "Daniel" (a prebuilt ElevenLabs voice with the
 * calm, precise, slightly-formal quality the design asks for — deliberately
 * NOT a clone of the film voice). Fails closed to SAPI when the key is
 * missing or a request errors.
 */
const DEFAULT_VOICE_ID = "onwK4e9ZLuTAKqWW03F9"; // ElevenLabs prebuilt "Daniel"
const SAMPLE_RATE = 16000;

export class ElevenTts {
  private queue: Promise<void> = Promise.resolve();
  private readonly voiceId: string;
  private readonly tmpDir: string;

  constructor(voiceId?: string) {
    this.voiceId = voiceId ?? getEnv("ELEVENLABS_VOICE_ID") ?? DEFAULT_VOICE_ID;
    this.tmpDir = mkdtempSync(path.join(os.tmpdir(), "jarvis-tts-"));
  }

  status(): ConnectorStatus {
    return getEnv("ELEVENLABS_API_KEY")
      ? { connected: true }
      : {
          connected: false,
          reason: "no ELEVENLABS_API_KEY in .env.local — pro voice falls back to SAPI",
        };
  }

  /** Serialized. Throws on failure so the caller can fall back to SAPI. */
  speak(text: string): Promise<void> {
    const run = async (): Promise<void> => {
      const key = getEnv("ELEVENLABS_API_KEY");
      if (!key) throw new Error("ELEVENLABS_API_KEY missing");
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}?output_format=pcm_16000`,
        {
          method: "POST",
          headers: { "xi-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({ text, model_id: "eleven_turbo_v2_5" }),
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}`);
      const pcm = Buffer.from(await res.arrayBuffer());
      const wavPath = path.join(this.tmpDir, "say.wav");
      writeFileSync(wavPath, wrapWav(pcm));
      await playWav(wavPath);
    };
    const chained = this.queue.then(run);
    // keep the queue alive even when a run rejects
    this.queue = chained.catch(() => {});
    return chained;
  }
}

/** Raw 16 kHz mono 16-bit PCM → WAV container for System.Media.SoundPlayer. */
function wrapWav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function playWav(wavPath: string): Promise<void> {
  return new Promise((resolve) => {
    const ps = spawn(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `$p = New-Object System.Media.SoundPlayer '${wavPath.replace(/'/g, "''")}'; $p.PlaySync()`,
      ],
      { stdio: "ignore" },
    );
    ps.on("error", () => resolve());
    ps.on("exit", () => resolve());
  });
}
