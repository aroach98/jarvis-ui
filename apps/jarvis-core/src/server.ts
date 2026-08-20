import { WebSocketServer, WebSocket } from "ws";
import type {
  ActionRequest,
  ActionResult,
  ClientMessage,
  CostMode,
  PanelId,
  PanelState,
  ServerMessage,
} from "@jarvis-ui/shared";
import { TermHost } from "./term.js";

/**
 * WS server per packages/shared's protocol: clients subscribe by panel id
 * and receive panel-state messages; the latest state per panel is replayed
 * immediately on subscribe so a reconnecting window never waits a full poll.
 */
export class HudServer {
  private readonly wss: WebSocketServer;
  private readonly subs = new Map<WebSocket, PanelId>();
  private readonly last = new Map<PanelId, PanelState>();
  private readonly termSubs = new Set<WebSocket>();
  private readonly term = new TermHost(
    (data) => this.termBroadcast({ type: "term-data", data }),
    (code) => this.termBroadcast({ type: "term-exit", code }),
  );

  constructor(
    port: number,
    onSetMode: (mode: CostMode) => void,
    onAction: (action: ActionRequest) => Promise<ActionResult>,
    onSetMuted: (muted: boolean) => void,
  ) {
    this.wss = new WebSocketServer({ host: "127.0.0.1", port });
    this.wss.on("listening", () => console.log(`[core] WS listening on 127.0.0.1:${port}`));
    this.wss.on("connection", (ws) => {
      this.send(ws, { type: "hello", ts: new Date().toISOString() });
      ws.on("message", (raw) => {
        let msg: ClientMessage;
        try {
          msg = JSON.parse(String(raw)) as ClientMessage;
        } catch {
          return;
        }
        if (msg.type === "subscribe") {
          this.subs.set(ws, msg.panel);
          const cached = this.last.get(msg.panel);
          if (cached) {
            this.send(ws, { type: "panel-state", ts: new Date().toISOString(), ...cached });
          }
        } else if (msg.type === "set-mode") {
          onSetMode(msg.mode);
        } else if (msg.type === "set-muted") {
          onSetMuted(msg.muted);
        } else if (msg.type === "action") {
          const { id } = msg;
          void onAction(msg.action)
            .catch((err: Error): ActionResult => ({ ok: false, message: err.message }))
            .then((result) => this.send(ws, { type: "action-result", id, ...result }));
        } else if (msg.type === "term-attach") {
          this.termSubs.add(ws);
          try {
            const replay = this.term.attach(msg.cols, msg.rows);
            if (replay) this.send(ws, { type: "term-data", data: replay });
          } catch (err) {
            this.send(ws, {
              type: "term-data",
              data: `\r\n[jarvis] terminal failed: ${(err as Error).message}\r\n`,
            });
          }
        } else if (msg.type === "term-input") {
          this.term.write(msg.data);
        } else if (msg.type === "term-resize") {
          this.term.resize(msg.cols, msg.rows);
        }
      });
      ws.on("close", () => {
        this.subs.delete(ws);
        this.termSubs.delete(ws);
      });
      ws.on("error", () => {
        this.subs.delete(ws);
        this.termSubs.delete(ws);
      });
    });
  }

  /** Latest published state for a panel (voice answers read from this cache). */
  getState(panel: PanelId): PanelState | undefined {
    return this.last.get(panel);
  }

  publish(state: PanelState): void {
    this.last.set(state.panel, state);
    const msg: ServerMessage = { type: "panel-state", ts: new Date().toISOString(), ...state };
    for (const [ws, panel] of this.subs) {
      if (panel === state.panel && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    }
  }

  private termBroadcast(msg: ServerMessage): void {
    for (const ws of this.termSubs) this.send(ws, msg);
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }
}
