import { spawn } from "node:child_process";

/**
 * Play a WAV file to the default output device and resolve when it ends.
 * System.Media.SoundPlayer is synchronous (PlaySync), so the child's exit is
 * the end-of-playback signal — no extra plumbing needed to serialize speech.
 */
export function playWav(wavPath: string): Promise<void> {
  return new Promise((resolve) => {
    const ps = spawn(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `$p = New-Object System.Media.SoundPlayer '${wavPath.replace(/'/g, "''")}'; $p.PlaySync(); $p.Dispose()`,
      ],
      { stdio: "ignore" },
    );
    ps.on("error", () => resolve());
    ps.on("exit", () => resolve());
  });
}
