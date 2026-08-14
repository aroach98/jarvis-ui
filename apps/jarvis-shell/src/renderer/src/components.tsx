import { useEffect, useState } from "react";
import type { ConnectorStatus } from "@jarvis-ui/shared";

/** A subagent that isn't wired yet — honest "not configured", never fake data. */
export function SectionOffline({ status }: { status: ConnectorStatus }): JSX.Element {
  return (
    <div className="offline">
      <b>not configured</b>
      {status.reason ?? "connector offline"}
    </div>
  );
}

export function LinkBanner({ linkUp }: { linkUp: boolean }): JSX.Element | null {
  if (linkUp) return null;
  return <div className="link-banner">link down — reconnecting to jarvis-core</div>;
}

export function Awaiting(): JSX.Element {
  return <div className="awaiting">awaiting state from jarvis-core…</div>;
}

/**
 * Bracketed sub-box; the panels distribute leftover monitor height across
 * these via grow weights so content fills the display instead of pinning
 * to the top of a mostly-empty panel.
 */
export function Section({
  title,
  right,
  grow = 1,
  children,
}: {
  title: string;
  right?: JSX.Element | string | null;
  grow?: number;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="section" style={{ flexGrow: grow }}>
      <Reticle className="section-reticle" />
      <div className="section-head">
        <span className="section-title">{title}</span>
        {right}
      </div>
      <div className="flow-line" aria-hidden />
      <div className="section-content">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ambient decorations — abstract HUD chrome, deliberately unlabeled   */
/* so motion never reads as fabricated data (CLAUDE.md rule).          */
/* ------------------------------------------------------------------ */

/** Faint scanline that sweeps each panel top-to-bottom. */
export function ScanSweep(): JSX.Element {
  return <div className="scan-sweep" aria-hidden />;
}

/** Large rotating reticle watermark filling a panel's dead space. */
export function Reticle({ className = "" }: { className?: string }): JSX.Element {
  return (
    <svg className={`reticle ${className}`} viewBox="0 0 200 200" aria-hidden>
      <g className="spin s90">
        <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeWidth="0.6" strokeDasharray="2 6" />
      </g>
      <g className="spin rev40">
        <circle cx="100" cy="100" r="78" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="60 40" />
      </g>
      <g className="spin s25">
        <circle cx="100" cy="100" r="58" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="8 10" />
      </g>
      <circle cx="100" cy="100" r="40" fill="none" stroke="currentColor" strokeWidth="0.5" />
      <path d="M100 2v14M100 184v14M2 100h14M184 100h14" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

const HEX = "0123456789ABCDEF";
function randRow(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += HEX[Math.floor(Math.random() * 16)];
  return s;
}

/** Slowly-churning hex glyph columns — pure texture, no meaning. */
export function HexStream({ rows = 3, len = 8 }: { rows?: number; len?: number }): JSX.Element {
  const [lines, setLines] = useState<string[]>(() =>
    Array.from({ length: rows }, () => randRow(len)),
  );
  useEffect(() => {
    const t = window.setInterval(() => {
      setLines((prev) => {
        const next = [...prev];
        next[Math.floor(Math.random() * next.length)] = randRow(len);
        return next;
      });
    }, 1100);
    return () => window.clearInterval(t);
  }, [len]);
  return (
    <div className="hex-stream" aria-hidden>
      {lines.map((l, i) => (
        <span key={i}>{l}</span>
      ))}
    </div>
  );
}
