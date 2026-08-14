import { useJarvisSocket } from "../useJarvisSocket";
import {
  Awaiting,
  HexStream,
  LinkBanner,
  Reticle,
  ScanSweep,
  Section,
  SectionOffline,
} from "../components";

/** Right display — everything Momentum: inbox, fleet, CRM pipeline. */
export function RightPanel(): JSX.Element {
  const { state, linkUp } = useJarvisSocket("right");

  return (
    <section className="panel right">
      <div className="corner-br" />
      <ScanSweep />
      <Reticle />
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
        <div className="head-right">
          {state?.inbox.connector.connected && (
            <span className="chip queued">{state.inbox.unread} unread</span>
          )}
          <HexStream />
        </div>
      </div>
      {!state ? (
        <Awaiting />
      ) : (
        <div className="panel-body">
          <Section title="Inbox" grow={2}>
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
          </Section>

          <Section
            title="Fleet"
            grow={2}
            right={
              state.fleet.connector.connected ? (
                <span className="spend">${state.fleet.spendTodayUsd.toFixed(2)} today</span>
              ) : null
            }
          >
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
          </Section>

          <Section title="CRM pipeline" grow={4} attention={state.crm.directives?.attention}>
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
          </Section>

          <Section title="Outreach · Phase 2" grow={1}>
            <div className="outreach-note">
              <b>Not built yet:</b> autonomous demo-send status to nearby businesses —
              queued / sent / replied counts land here once the outreach system exists.
            </div>
          </Section>
        </div>
      )}
    </section>
  );
}
