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
