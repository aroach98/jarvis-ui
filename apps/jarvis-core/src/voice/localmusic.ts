import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The embedded briefing soundtrack: audio files the user drops into a local
 * `music/` folder (gitignored — this repo is public and ships no copyrighted
 * audio; see music/README.md for the suggested film tracklist). Preferred
 * over Spotify when any tracks exist: no network, no account, no active
 * device required. Playback is a shuffled rotation at ducked volume via a
 * child PowerShell WPF MediaPlayer; stop() simply kills it.
 */
const EXTS = new Set([".mp3", ".wav", ".wma", ".m4a", ".aac"]);
const DUCK_VOLUME = 0.15;

export class LocalMusicPlayer {
  private proc?: ChildProcess;

  constructor(private readonly dir: string) {}

  tracks(): string[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => EXTS.has(path.extname(f).toLowerCase()))
      .map((f) => path.join(this.dir, f));
  }

  available(): boolean {
    return this.tracks().length > 0;
  }

  /** Start a shuffled rotation at ducked volume. False = no tracks. */
  start(): boolean {
    const tracks = shuffle(this.tracks());
    if (tracks.length === 0) return false;
    this.stop();
    const script = `
Add-Type -AssemblyName PresentationCore
$files = $env:JARVIS_TRACKS -split '\\|'
$p = New-Object System.Windows.Media.MediaPlayer
$p.Volume = ${DUCK_VOLUME}
foreach ($f in $files) {
  $p.Open([Uri]$f)
  $tries = 0
  while (-not $p.NaturalDuration.HasTimeSpan -and $tries -lt 50) { Start-Sleep -Milliseconds 200; $tries++ }
  if (-not $p.NaturalDuration.HasTimeSpan) { continue }
  $p.Play()
  Start-Sleep -Seconds ([int]$p.NaturalDuration.TimeSpan.TotalSeconds + 1)
  $p.Stop()
}
`;
    this.proc = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
      stdio: "ignore",
      env: {
        ...process.env,
        JARVIS_TRACKS: tracks.map((t) => pathToFileURL(t).href).join("|"),
      },
    });
    this.proc.on("error", () => (this.proc = undefined));
    this.proc.on("exit", () => (this.proc = undefined));
    return true;
  }

  stop(): void {
    if (this.proc && !this.proc.killed) this.proc.kill();
    this.proc = undefined;
  }
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
