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

  /** Spawn (or reuse) the pty; returns the replay buffer for the new client. */
  attach(cols: number, rows: number): string {
    if (!this.pty) {
      const pty = spawn("herdr.exe", [], {
        name: "xterm-256color",
        cols: Math.max(20, cols),
        rows: Math.max(5, rows),
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
      console.log(`[core] terminal: spawned herdr client (pid ${pty.pid})`);
    } else {
      this.pty.resize(Math.max(20, cols), Math.max(5, rows));
    }
    return this.ring;
  }

  write(data: string): void {
    this.pty?.write(data);
  }

  resize(cols: number, rows: number): void {
    this.pty?.resize(Math.max(20, cols), Math.max(5, rows));
  }
}
