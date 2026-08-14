import { useJarvisSocket } from "../useJarvisSocket";
import { Awaiting, LinkBanner, SectionOffline } from "../components";

/** Right display — everything Momentum: inbox, fleet, CRM pipeline. */
export function RightPanel(): JSX.Element {
  const { state, linkUp } = useJarvisSocket("right");

  return (
    <section className="panel right">
      <div className="corner-br" />
      <LinkBanner linkUp={linkUp} />
      <div className="panel-head">
        <div className="headline">
          <div className="badge momentum">
            <span>M</span>
          </div>
          <div>
            <div className="tag">Right display</div>
            <h2>Momentum</h2>
          </div>
        </div>
        {state?.inbox.connector.connected && (
          <span className="chip queued">{state.inbox.unread} unread</span>
        )}
      </div>
      {!state ? (
        <Awaiting />
      ) : (
        <div className="panel-body">
          {!state.inbox.connector.connected ? (
            <SectionOffline status={state.inbox.connector} />
          ) : (
            <>
              <div className="count-banner">
                <div>
                  <div className="num">{state.inbox.unread}</div>
                  <div className="lbl">unread</div>
                </div>
                <div>
                  <div className="num">{state.inbox.dueThisWeek}</div>
                  <div className="lbl">due this week</div>
                </div>
              </div>
              <div>
                {state.inbox.items.map((m, i) => (
                  <div className="inbox-item" key={i}>
                    <div className="from">
                      {m.from} <span className="time">{m.time}</span>
                    </div>
                    <div className="subj">
                      {m.subject}
                      {m.urgent && (
                        <span className="chip urgent" style={{ marginLeft: 6 }}>
                          urgent
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div>
            <div className="section-label">
              Fleet
              {state.fleet.connector.connected && (
                <span className="spend">${state.fleet.spendTodayUsd.toFixed(2)} today</span>
              )}
            </div>
            {!state.fleet.connector.connected ? (
              <SectionOffline status={state.fleet.connector} />
            ) : (
              state.fleet.runs.map((r, i) => (
                <div className="row" key={i}>
                  <span className="name">{r.name}</span>
                  <span className={`chip ${r.status}`}>
                    {r.status === "running" && <span className="dot" />}
                    {r.status}
                  </span>
                </div>
              ))
            )}
          </div>

          <div>
            <div className="section-label">CRM pipeline</div>
            {!state.crm.connector.connected ? (
              <SectionOffline status={state.crm.connector} />
            ) : state.crm.clients.length === 0 ? (
              <div className="row">
                <span className="name" style={{ color: "var(--text-faint)" }}>
                  no open deals
                </span>
              </div>
            ) : (
              state.crm.clients.map((c, i) => (
                <div className="row" key={i}>
                  <span className="name">{c.name}</span>
                  <span className={`stage ${c.stage}`}>{c.stage.replace(/_/g, " ")}</span>
                </div>
              ))
            )}
          </div>

          <div className="outreach-block">
            <b>Phase 2, not built:</b> autonomous demo-send status to nearby businesses —
            queued / sent / replied counts land here once the outreach system exists.
          </div>
        </div>
      )}
    </section>
  );
}
