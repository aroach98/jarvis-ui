import { spawn } from "node:child_process";
import type { ConnectorStatus } from "@jarvis-ui/shared";

/**
 * Free-mode TTS via Windows SAPI (System.Speech) — $0, offline, available on
 * every Windows box. Text goes over stdin so no shell-quoting surface exists.
 * Pro-mode cloud TTS is Phase 4 and slots in behind the same speak() call.
 */
export class SapiTts {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly voice?: string,
    private readonly rate: number = 0,
  ) {}

  status(): ConnectorStatus {
    return process.platform === "win32"
      ? { connected: true }
      : { connected: false, reason: "SAPI TTS is Windows-only" };
  }

  /** Serialized: a second speak() waits for the first to finish. */
  speak(text: string): Promise<void> {
    const run = (): Promise<void> =>
      new Promise((resolve) => {
        const select = this.voice
          ? `$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -like '*${this.voice.replace(/'/g, "")}*' } | Select-Object -First 1; if ($v) { $s.SelectVoice($v.VoiceInfo.Name) };`
          : "";
        const script =
          "Add-Type -AssemblyName System.Speech; " +
          "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; " +
          `$s.Rate = ${Math.max(-10, Math.min(10, Math.round(this.rate)))}; ` +
          select +
          "$s.Speak([Console]::In.ReadToEnd()); $s.Dispose()";
        const ps = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
          stdio: ["pipe", "ignore", "ignore"],
        });
        ps.on("error", () => resolve());
        ps.on("exit", () => resolve());
        ps.stdin.write(text);
        ps.stdin.end();
      });
    this.queue = this.queue.then(run);
    return this.queue;
  }
}
