import os from "node:os";
import { spawn, type IPty } from "@lydell/node-pty";

/**
 * Embedded-terminal host: one pty running the herdr CLIENT (the TUI is just
 * a renderer — the herdr server owns every pane's shell, so this window is
 * exactly another attach, and killing/respawning it never touches the
 * sessions; see the herdr client/server contract). Output fans out to every
 * attached HUD window; a scrollback ring replays on attach so a reconnect
 * isn't a blank screen.
 */
export class TermHost {
  private pty: IPty | null = null;
  private ring = "";
  private readonly onData: (data: string) => void;
  private readonly onExit: (code: number) => void;

  constructor(onData: (data: string) => void, onExit: (code: number) => void) {
    this.onData = onData;
    this.onExit = onExit;
  }

  /**
   * Wire values arrive from a window mid-layout, where xterm's fit addon can
   * yield NaN/0 — and Math.max(20, NaN) is NaN, which ConPTY answers with a
   * NATIVE crash (no JS stack; this took the whole core down 2026-08-16).
   * Sanitize hard and never let a pty call escape.
   */
  private static dim(v: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(v) || v < min) return fallback;
    return Math.min(max, Math.floor(v));
  }

  /** Spawn (or reuse) the pty; returns the replay buffer for the new client. */
  attach(cols: number, rows: number): string {
    const c = TermHost.dim(cols, 20, 500, 80);
    const r = TermHost.dim(rows, 5, 300, 24);
    if (!this.pty) {
      const pty = spawn("herdr.exe", [], {
        name: "xterm-256color",
        cols: c,
        rows: r,
        cwd: os.homedir(),
        env: process.env as Record<string, string>,
      });
      this.pty = pty;
      this.ring = "";
      pty.onData((data) => {
        this.ring = (this.ring + data).slice(-200_000);
        this.onData(data);
      });
      pty.onExit(({ exitCode }) => {
        this.pty = null;
        this.onExit(exitCode);
      });
      console.log(`[core] terminal: spawned herdr client (pid ${pty.pid}, ${c}x${r})`);
    } else {
      this.resize(c, r);
    }
    return this.ring;
  }

  write(data: string): void {
    try {
      this.pty?.write(data);
    } catch (err) {
      console.warn(`[core] terminal write failed: ${(err as Error).message}`);
    }
  }

  resize(cols: number, rows: number): void {
    const c = TermHost.dim(cols, 20, 500, 80);
    const r = TermHost.dim(rows, 5, 300, 24);
    try {
      this.pty?.resize(c, r);
    } catch (err) {
      console.warn(`[core] terminal resize(${cols},${rows}) failed: ${(err as Error).message}`);
    }
  }
}
