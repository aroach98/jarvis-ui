import type { CoreVoiceStatus } from "@jarvis-ui/shared";
import { useJarvisSocket } from "../useJarvisSocket";
import { Awaiting, LinkBanner } from "../components";

const STATUS_LABEL: Record<CoreVoiceStatus, string> = {
  idle: "Standing by",
  listening: "Listening",
  routing: "Routing",
  speaking: "Speaking",
};

/** Bottom-middle (primary) — arc reactor, voice status, free/pro toggle. */
export function CorePanel(): JSX.Element {
  const { state, linkUp, setMode } = useJarvisSocket("core");

  return (
    <section className="panel core-panel">
      <div className="corner-br" />
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
          <div className={`reactor${state.voiceStatus === "idle" ? " dormant" : ""}`}>
            <div className="ring r1" />
            <div className="ring r2" />
            <div className="ring r3" />
            <div className="ring r4" />
            <div className="core" />
          </div>
          <div className="core-status">{STATUS_LABEL[state.voiceStatus]}</div>
          <div className="core-substatus">
            {state.voiceStatus === "idle"
              ? "voice pipeline lands in Phase 3 — panels refresh regardless"
              : 'wake phrase armed · "Jarvis"'}
          </div>

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

          <div className="route-line">
            {state.lastRoute ? (
              <>
                last route → <b>{state.lastRoute.subagent}</b> · &quot;{state.lastRoute.utterance}
                &quot; · {new Date(state.lastRoute.at).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </>
            ) : (
              <>no routes yet — voice intent routing lands in Phase 3</>
            )}
          </div>

          <div className="briefing-note">
            <b>&quot;Good morning, Jarvis&quot;</b> starts AC/DC quietly, then a 3-line flash
            briefing — CACC, Momentum, Today — 15 words or less each. (Phase 4.)
          </div>
        </div>
      )}
    </section>
  );
}
