import { useEffect, useRef, useState } from "react";
import { DEFAULT_WS_PORT } from "@jarvis-ui/shared";
import type {
  ClientMessage,
  CostMode,
  PanelId,
  PanelState,
  ServerMessage,
} from "@jarvis-ui/shared";

type StateFor<P extends PanelId> = Extract<PanelState, { panel: P }>["state"];

export interface JarvisSocket<P extends PanelId> {
  state: StateFor<P> | null;
  /** WS connection to jarvis-core is up (independent of upstream connectors). */
  linkUp: boolean;
  setMode: (mode: CostMode) => void;
}

/**
 * Subscribes this window to its panel's state stream from jarvis-core,
 * reconnecting with backoff — the HUD outlives core restarts.
 */
export function useJarvisSocket<P extends PanelId>(panel: P): JarvisSocket<P> {
  const [state, setState] = useState<StateFor<P> | null>(null);
  const [linkUp, setLinkUp] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const port =
      new URLSearchParams(window.location.search).get("ws") ?? String(DEFAULT_WS_PORT);
    let disposed = false;
    let retryMs = 1000;
    let timer: number | undefined;

    const connect = (): void => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      wsRef.current = ws;
      ws.onopen = () => {
        retryMs = 1000;
        setLinkUp(true);
        ws.send(JSON.stringify({ type: "subscribe", panel } satisfies ClientMessage));
      };
      ws.onmessage = (ev: MessageEvent<string>) => {
        const msg = JSON.parse(ev.data) as ServerMessage;
        if (msg.type === "panel-state" && msg.panel === panel) {
          // TS can't relate the union member to the unresolved generic P —
          // safe because the guard above matched this window's own panel id.
          (setState as (s: unknown) => void)(msg.state);
        }
      };
      ws.onclose = () => {
        setLinkUp(false);
        if (!disposed) {
          timer = window.setTimeout(connect, retryMs);
          retryMs = Math.min(retryMs * 2, 15_000);
        }
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [panel]);

  const setMode = (mode: CostMode): void => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "set-mode", mode } satisfies ClientMessage));
    }
  };

  return { state, linkUp, setMode };
}
