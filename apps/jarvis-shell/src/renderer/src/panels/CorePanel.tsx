import type { CoreVoiceStatus } from "@jarvis-ui/shared";
import { useJarvisSocket } from "../useJarvisSocket";
import { Awaiting, LinkBanner, ScanSweep } from "../components";

const STATUS_LABEL: Record<CoreVoiceStatus, string> = {
  idle: "Standing by",
  listening: "Listening",
  routing: "Routing",
  speaking: "Speaking",
};

/**
 * The arc reactor — layered SVG rings, several counter-rotating, always
 * alive. Voice states (Phase 3) spin it faster and brighter via the
 * .reactor2.<status> CSS modifiers.
 */
function Reactor({ status }: { status: CoreVoiceStatus }): JSX.Element {
  return (
    <div className={`reactor2 ${status}`}>
      <svg viewBox="0 0 400 400" aria-hidden>
        <defs>
          <radialGradient id="coreGrad" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#eafbff" />
            <stop offset="38%" stopColor="#8fe6ff" />
            <stop offset="70%" stopColor="#5fd8ff" />
            <stop offset="100%" stopColor="#2f6b7d" />
          </radialGradient>
        </defs>

        {/* outer tick ring */}
        <g className="spin s90">
          <circle cx="200" cy="200" r="192" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray="2 8.05" opacity="0.5" />
        </g>
        {/* cardinal marks (static) */}
        <path d="M200 0v16M200 384v16M0 200h16M384 200h16" stroke="currentColor" strokeWidth="2" opacity="0.6" />

        {/* long-arc ring */}
        <g className="spin s45">
          <circle cx="200" cy="200" r="176" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="96 28" opacity="0.7" />
        </g>
        {/* heavy segmented ring, counter-rotating */}
        <g className="spin rev20">
          <circle cx="200" cy="200" r="152" fill="none" stroke="currentColor" strokeWidth="7" strokeDasharray="42 20" opacity="0.55" />
        </g>
        <circle cx="200" cy="200" r="134" fill="none" stroke="currentColor" strokeWidth="0.75" opacity="0.5" />

        {/* rotor */}
        <g className="spin s14">
          <circle cx="200" cy="200" r="116" fill="none" stroke="currentColor" strokeWidth="16" strokeDasharray="50 24" opacity="0.4" />
        </g>
        {/* fast inner ring */}
        <g className="spin s6">
          <circle cx="200" cy="200" r="92" fill="none" stroke="currentColor" strokeWidth="3.5" strokeDasharray="11 8" opacity="0.85" />
        </g>

        <circle cx="200" cy="200" r="72" fill="none" stroke="currentColor" strokeWidth="1.25" opacity="0.7" />
        <circle className="core-disc" cx="200" cy="200" r="56" fill="url(#coreGrad)" />
      </svg>
      <div className="halo" aria-hidden />
    </div>
  );
}

/** Bottom-middle (primary) — arc reactor, voice status, mute, free/pro toggle. */
export function CorePanel(): JSX.Element {
  const { state, linkUp, setMode, setMuted } = useJarvisSocket("core");

  return (
    <section className="panel core-panel">
      <div className="corner-br" />
      <ScanSweep />
      <LinkBanner linkUp={linkUp} />
      <div className="panel-head">
        <div>
          <div className="tag">Bottom-middle · primary</div>
          <h2>Jarvis Core</h2>
        </div>
      </div>
      {!state ? (
        <Awaiting />
      ) : (
        <div className="panel-body">
          <Reactor status={state.muted ? "idle" : state.voiceStatus} />
          <div className={`wave ${state.muted ? "muted" : state.voiceStatus}`} aria-hidden>
            {Array.from({ length: 24 }, (_, i) => (
              <i key={i} style={{ "--i": i % 12 } as React.CSSProperties} />
            ))}
          </div>
          <div className={`core-status${state.muted ? " muted" : ""}`}>
            {state.muted ? "Muted" : STATUS_LABEL[state.voiceStatus]}
          </div>
          <div className="core-substatus">
            {state.muted
              ? "wake word off · mic released · hold F8 to talk"
              : state.voiceStatus === "idle"
                ? 'say "hey jarvis" · or hold F8 to talk'
                : "at your service, sir"}
          </div>

          <button
            type="button"
            className={`mute-btn${state.muted ? " muted" : ""}`}
            onClick={() => setMuted(!state.muted)}
            title="mutes Jarvis's wake listener only — the mic stays available to every other app"
          >
            {state.muted ? "🔇 muted — click to listen" : "🎙 listening — click to mute"}
          </button>

          {state.pipeline && (
            <div className="pipeline-chips">
              {(
                [
                  ["wake", state.pipeline.wake],
                  ["stt", state.pipeline.stt],
                  ["nlu", state.pipeline.nlu],
                  ["tts", state.pipeline.tts],
                ] as const
              ).map(([label, status]) => (
                <span
                  key={label}
                  className={`chip ${status.connected ? "ok" : "queued"}`}
                  title={status.reason ?? ""}
                >
                  {label}
                </span>
              ))}
            </div>
          )}

          <div className="mode-toggle">
            <button
              type="button"
              className={`opt free${state.mode === "free" ? " active" : ""}`}
              onClick={() => setMode("free")}
            >
              Free
            </button>
            <button
              type="button"
              className={`opt pro${state.mode === "pro" ? " active" : ""}`}
              onClick={() => setMode("pro")}
            >
              Pro
            </button>
          </div>

          <div className="core-footer">
            <div className="route-line">
              {state.lastRoute ? (
                <>
                  last route → <b>{state.lastRoute.subagent}</b> · &quot;
                  {state.lastRoute.utterance}&quot; ·{" "}
                  {new Date(state.lastRoute.at).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </>
              ) : (
                <>no routes yet — try &quot;hey jarvis&quot;</>
              )}
            </div>
            <div className="briefing-note">
              <b>&quot;Good morning&quot;</b> after the wake phrase: ducked AC/DC (when Spotify is
              wired) and a 3-line flash briefing — CACC, Momentum, Today. &quot;That&apos;s
              enough&quot; stops the music.
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
