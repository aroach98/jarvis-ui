import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { TermChannel } from "../../useJarvisSocket";

/**
 * The herdr terminal, embedded: jarvis-core hosts a pty running the herdr
 * client (another attach to the same herdr server as every other window),
 * streamed here into xterm.js. The ANSI palette is the HUD's own, so the
 * TUI renders in JARVIS colors. Click to focus and type exactly like the
 * standalone window.
 */
const HUD_THEME = {
  background: "#070c0f",
  foreground: "#d9eef4",
  cursor: "#5fd8ff",
  cursorAccent: "#05080a",
  selectionBackground: "rgba(95,216,255,0.28)",
  black: "#0a1114",
  red: "#ff6b6b",
  green: "#57e6a1",
  yellow: "#f2a94e",
  blue: "#5fd8ff",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#d9eef4",
  brightBlack: "#3f545a",
  brightRed: "#ff8f8f",
  brightGreen: "#7cf0bd",
  brightYellow: "#f7c380",
  brightBlue: "#8fe6ff",
  brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9",
  brightWhite: "#eafbff",
};

export function TerminalSection({
  term,
  linkUp,
}: {
  term: TermChannel;
  linkUp: boolean;
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !linkUp) return;

    // Root font-size carries the per-display HUD scale; ride it.
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
    const xt = new Terminal({
      theme: HUD_THEME,
      fontFamily: '"Cascadia Code", Consolas, monospace',
      fontSize: Math.round(rem * 1.25),
      cursorBlink: true,
      scrollback: 4000,
      allowTransparency: true,
    });
    const fit = new FitAddon();
    xt.loadAddon(fit);
    xt.open(host);
    fit.fit();
    xtermRef.current = xt;

    term.attach(xt.cols, xt.rows);
    const offData = term.onData((d) => xt.write(d));
    const onInput = xt.onData((d) => term.input(d));
    const ro = new ResizeObserver(() => {
      fit.fit();
      term.resize(xt.cols, xt.rows);
    });
    ro.observe(host);

    return () => {
      offData();
      onInput.dispose();
      ro.disconnect();
      xt.dispose();
      xtermRef.current = null;
    };
    // term is a stable channel over one socket; re-run only when the link cycles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkUp]);

  return (
    <div className="term-wrap">
      {!linkUp && <div className="awaiting">terminal offline — reconnecting…</div>}
      <div className="term-host" ref={hostRef} onClick={() => xtermRef.current?.focus()} />
      <button
        type="button"
        className="expand-btn term-restart"
        title="restart the embedded herdr client (sessions live on the herdr server)"
        onClick={() => {
          const xt = xtermRef.current;
          if (xt) term.attach(xt.cols, xt.rows);
        }}
      >
        ↻
      </button>
    </div>
  );
}
