import { useState } from "react";
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
import { InboxCompact, InboxOverlay } from "./sections/InboxViews";
import { QueueCompact, QueueOverlay } from "./sections/QueueViews";
import { FleetCompact, FleetOverlay } from "./sections/FleetViews";
import { TerminalSection } from "./sections/TerminalSection";

type LeftOverlay = "inbox" | "queue" | "fleet" | null;

/**
 * Left display — everything CACC: inbox triage, HQ bug/feature queue,
 * the AGENTS pipeline, and the embedded herdr terminal. Sections stay
 * condensed; ⛶ expands one across the whole display.
 */
export function LeftPanel(): JSX.Element {
  const sock = useJarvisSocket("left");
  const { state, linkUp, request } = sock;
  const [overlay, setOverlay] = useState<LeftOverlay>(null);

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
            grow={3}
            attention={state.inbox.directives?.attention}
            onExpand={() => setOverlay("inbox")}
          >
            {!state.inbox.connector.connected ? (
              <SectionOffline status={state.inbox.connector} />
            ) : (
              <InboxCompact inbox={state.inbox} />
            )}
          </Section>

          <Section
            title="HQ queue · bugs & features"
            grow={4}
            attention={state.queue.directives?.attention}
            onExpand={() => setOverlay("queue")}
          >
            {!state.queue.connector.connected ? (
              <SectionOffline status={state.queue.connector} />
            ) : (
              <QueueCompact queue={state.queue} />
            )}
          </Section>

          <Section
            title="Agent fleet · pipeline"
            grow={4}
            attention={state.fleet.directives?.attention}
            onExpand={() => setOverlay("fleet")}
          >
            {!state.fleet.connector.connected ? (
              <SectionOffline status={state.fleet.connector} />
            ) : (
              <FleetCompact fleet={state.fleet} />
            )}
          </Section>

          <Section title="Terminal · herdr" grow={7}>
            <TerminalSection term={sock.term} linkUp={linkUp} />
          </Section>

          {overlay === "inbox" && (
            <InboxOverlay inbox={state.inbox} request={request} onClose={() => setOverlay(null)} />
          )}
          {overlay === "queue" && (
            <QueueOverlay queue={state.queue} request={request} onClose={() => setOverlay(null)} />
          )}
          {overlay === "fleet" && (
            <FleetOverlay fleet={state.fleet} onClose={() => setOverlay(null)} />
          )}
        </div>
      )}
    </section>
  );
}
