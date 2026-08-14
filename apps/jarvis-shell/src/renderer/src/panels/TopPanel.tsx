import { useJarvisSocket } from "../useJarvisSocket";
import { Awaiting, LinkBanner, SectionOffline } from "../components";

function fillClass(pct: number): string {
  if (pct >= 85) return "crit";
  if (pct >= 60) return "warn";
  return "good";
}

/** Top display — Subscriptions (locked in) & Today (still provisional). */
export function TopPanel(): JSX.Element {
  const { state, linkUp } = useJarvisSocket("top");

  return (
    <section className="panel provisional">
      <div className="corner-br" />
      <LinkBanner linkUp={linkUp} />
      <div className="panel-head">
        <div>
          <div className="tag">Top display · partially decided</div>
          <h2>Subscriptions &amp; Today</h2>
        </div>
        <span className="provisional-flag">to-do section not decided</span>
      </div>
      {!state ? (
        <Awaiting />
      ) : (
        <div className="panel-body">
          <div>
            <div className="section-label">Subscriptions · usage.andrewroach.xyz</div>
            {!state.subscriptions.connector.connected ? (
              <SectionOffline status={state.subscriptions.connector} />
            ) : (
              <div className="usage-list">
                {state.subscriptions.items.map((s, i) => (
                  <div className="usage-row" key={i}>
                    <div className="usage-head">
                      <span className="name">
                        {s.name} <span className="payer">· {s.payer}</span>
                      </span>
                      <span className="pct">{Math.round(s.usedPct)}%</span>
                    </div>
                    <div className="usage-track">
                      <div
                        className={`usage-fill ${fillClass(s.usedPct)}`}
                        style={{ width: `${Math.min(100, s.usedPct)}%` }}
                      />
                    </div>
                    <div className="usage-meta">
                      {s.windowLabel} · {s.resetsLabel}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="section-label">Taskers due · Andrew OS</div>
            {!state.tasks.connector.connected ? (
              <SectionOffline status={state.tasks.connector} />
            ) : state.tasks.items.length === 0 ? (
              <div className="task-item">
                <span style={{ color: "var(--text-faint)" }}>nothing due in the next 14 days</span>
              </div>
            ) : (
              state.tasks.items.map((t, i) => (
                <div className={`task-item${t.done ? " done" : ""}`} key={i}>
                  <input type="checkbox" checked={t.done} readOnly />
                  <span>{t.label}</span>
                  <span className="due">{t.due}</span>
                </div>
              ))
            )}
          </div>

          <div className="spend-total">
            <span>API spend today · all worlds</span>
            {state.spendTodayUsd.connector.connected ? (
              <b>${state.spendTodayUsd.total.toFixed(2)}</b>
            ) : (
              <span className="why">
                — {state.spendTodayUsd.connector.reason ?? "ledger offline"}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
