import { WebSocketServer, WebSocket } from "ws";
import type {
  ClientMessage,
  CostMode,
  PanelId,
  PanelState,
  ServerMessage,
} from "@jarvis-ui/shared";

/**
 * WS server per packages/shared's protocol: clients subscribe by panel id
 * and receive panel-state messages; the latest state per panel is replayed
 * immediately on subscribe so a reconnecting window never waits a full poll.
 */
export class HudServer {
  private readonly wss: WebSocketServer;
  private readonly subs = new Map<WebSocket, PanelId>();
  private readonly last = new Map<PanelId, PanelState>();

  constructor(port: number, onSetMode: (mode: CostMode) => void) {
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
        }
      });
      ws.on("close", () => this.subs.delete(ws));
      ws.on("error", () => this.subs.delete(ws));
    });
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

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }
}
