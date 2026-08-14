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

/** Left display — everything CACC: inbox triage, fleet, checks & deploys. */
export function LeftPanel(): JSX.Element {
  const { state, linkUp } = useJarvisSocket("left");

  return (
    <section className="panel">
      <div className="corner-br" />
      <ScanSweep />
      <Reticle />
      <LinkBanner linkUp={linkUp} />
      <div className="panel-head">
        <div className="headline">
          <div className="badge cacc">CACC</div>
          <div>
            <div className="tag">Left display</div>
            <h2>CACC</h2>
          </div>
        </div>
        <div className="head-right">
          {state && state.inbox.flagged > 0 && (
            <span className="chip urgent">{state.inbox.flagged} flagged</span>
          )}
          <HexStream />
        </div>
      </div>
      {!state ? (
        <Awaiting />
      ) : (
        <div className="panel-body">
          <Section
            title="Inbox · andrew.roach@cacadets.org"
            grow={5}
            attention={state.inbox.directives?.attention}
          >
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
                    <div className={state.inbox.flagged > 0 ? "num crit" : "num"}>
                      {state.inbox.flagged}
                    </div>
                    <div className="lbl">flagged</div>
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

          <Section
            title="Checks & deploys"
            grow={6}
            attention={state.checks.directives?.attention}
          >
            {!state.checks.connector.connected ? (
              <SectionOffline status={state.checks.connector} />
            ) : (
              state.checks.items.map((c, i) => (
                <div className="check-item" key={i}>
                  <span className="site">{c.site}</span>
                  <span className={`chip ${c.verdict}`}>{c.label}</span>
                </div>
              ))
            )}
          </Section>
        </div>
      )}
    </section>
  );
}
