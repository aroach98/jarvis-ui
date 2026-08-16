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
  attention = false,
  onExpand,
  children,
}: {
  title: string;
  right?: JSX.Element | string | null;
  grow?: number;
  /** Generative-UI directive: the owning subagent flagged this section. */
  attention?: boolean;
  /** When set, the header grows an expand control opening the full-panel view. */
  onExpand?: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className={`section${attention ? " attention" : ""}`} style={{ flexGrow: grow }}>
      <Reticle className="section-reticle" />
      <div className="section-head">
        <span className="section-title">{title}</span>
        <span className="section-head-right">
          {right}
          {onExpand && (
            <button type="button" className="expand-btn" onClick={onExpand} title="expand">
              ⛶
            </button>
          )}
        </span>
      </div>
      <div className="flow-line" aria-hidden />
      <div className="section-content">{children}</div>
    </div>
  );
}

/**
 * Full-panel takeover: pushes the sections aside (covers them) to give one
 * dataset the entire display, HUD-framed. Esc or ✕ closes.
 */
export function Overlay({
  title,
  onClose,
  right,
  children,
}: {
  title: string;
  onClose: () => void;
  right?: JSX.Element | string | null;
  children: React.ReactNode;
}): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay">
      <div className="overlay-head">
        <span className="overlay-title">{title}</span>
        <span className="overlay-head-right">
          {right}
          <button type="button" className="expand-btn close" onClick={onClose} title="close (esc)">
            ✕
          </button>
        </span>
      </div>
      <div className="flow-line" aria-hidden />
      <div className="overlay-body">{children}</div>
    </div>
  );
}

/** HUD-styled action button with a busy state. */
export function HudButton({
  onClick,
  busy = false,
  disabled = false,
  tone = "accent",
  children,
}: {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: "accent" | "danger";
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`hud-btn ${tone}${busy ? " busy" : ""}`}
      disabled={disabled || busy}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {busy ? "…" : children}
    </button>
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
