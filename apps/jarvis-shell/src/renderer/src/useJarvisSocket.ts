import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_WS_PORT } from "@jarvis-ui/shared";
import type {
  ActionRequest,
  ActionResult,
  ClientMessage,
  CostMode,
  PanelId,
  PanelState,
  ServerMessage,
} from "@jarvis-ui/shared";

type StateFor<P extends PanelId> = Extract<PanelState, { panel: P }>["state"];

export interface TermChannel {
  attach: (cols: number, rows: number) => void;
  input: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  /** Subscribe to pty output; exit arrives as a printed notice. Returns unsubscribe. */
  onData: (cb: (data: string) => void) => () => void;
}

export interface JarvisSocket<P extends PanelId> {
  state: StateFor<P> | null;
  /** WS connection to jarvis-core is up (independent of upstream connectors). */
  linkUp: boolean;
  setMode: (mode: CostMode) => void;
  /** Jarvis-only mic mute — the wake sidecar releases its stream, PTT stays. */
  setMuted: (muted: boolean) => void;
  /** Interactive request → core's action-result (never rejects; ok:false on failure). */
  request: (action: ActionRequest) => Promise<ActionResult>;
  /** Embedded-terminal channel (herdr client hosted by jarvis-core). */
  term: TermChannel;
}

/**
 * Subscribes this window to its panel's state stream from jarvis-core,
 * reconnecting with backoff — the HUD outlives core restarts.
 */
export function useJarvisSocket<P extends PanelId>(panel: P): JarvisSocket<P> {
  const [state, setState] = useState<StateFor<P> | null>(null);
  const [linkUp, setLinkUp] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef(new Map<string, (r: ActionResult) => void>());
  const seqRef = useRef(0);
  const termListenersRef = useRef(new Set<(data: string) => void>());

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
        } else if (msg.type === "action-result") {
          const resolve = pendingRef.current.get(msg.id);
          if (resolve) {
            pendingRef.current.delete(msg.id);
            resolve(msg);
          }
        } else if (msg.type === "term-data") {
          for (const cb of termListenersRef.current) cb(msg.data);
        } else if (msg.type === "term-exit") {
          for (const cb of termListenersRef.current) {
            cb(`\r\n\x1b[38;5;209m[terminal exited (${msg.code}) — press restart]\x1b[0m\r\n`);
          }
        }
      };
      ws.onclose = () => {
        setLinkUp(false);
        // In-flight requests can't complete on a dead socket — fail them now.
        for (const resolve of pendingRef.current.values()) {
          resolve({ ok: false, message: "link to jarvis-core dropped" });
        }
        pendingRef.current.clear();
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

  const setMuted = (muted: boolean): void => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "set-muted", muted } satisfies ClientMessage));
    }
  };

  const request = useCallback((action: ActionRequest): Promise<ActionResult> => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) {
      return Promise.resolve({ ok: false, message: "link to jarvis-core is down" });
    }
    const id = `a${++seqRef.current}`;
    return new Promise<ActionResult>((resolve) => {
      pendingRef.current.set(id, resolve);
      ws.send(JSON.stringify({ type: "action", id, action } satisfies ClientMessage));
      // Belt-and-braces: never leave a button spinning forever.
      window.setTimeout(() => {
        if (pendingRef.current.delete(id)) {
          resolve({ ok: false, message: "jarvis-core did not answer (30s)" });
        }
      }, 30_000);
    });
  }, []);

  const termSend = useCallback((msg: ClientMessage): void => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);
  const term: TermChannel = {
    attach: (cols, rows) => termSend({ type: "term-attach", cols, rows }),
    input: (data) => termSend({ type: "term-input", data }),
    resize: (cols, rows) => termSend({ type: "term-resize", cols, rows }),
    onData: (cb) => {
      termListenersRef.current.add(cb);
      return () => termListenersRef.current.delete(cb);
    },
  };

  return { state, linkUp, setMode, setMuted, request, term };
}
