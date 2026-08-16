import { useState } from "react";
import type { ActionRequest, ActionResult, CaccPanelState, CheckItem } from "@jarvis-ui/shared";
import { HudButton, Overlay } from "../../components";

type Request = (action: ActionRequest) => Promise<ActionResult>;
type Checks = CaccPanelState["checks"];

interface InvState {
  busy?: boolean;
  msg?: string;
  ok?: boolean;
}

function useInvestigate(request: Request): {
  controls: (c: CheckItem) => JSX.Element | null;
} {
  const [inv, setInv] = useState<Record<string, InvState>>({});
  const controls = (c: CheckItem): JSX.Element | null => {
    // Only failing rows with a known repo can be handed to an agent.
    if (c.verdict === "ok" || !c.siteId || !c.repoSlug || !c.kind) return null;
    const key = c.site;
    const st = inv[key];
    if (st?.ok) return <span className="chip ok">{st.msg ?? "filed"}</span>;
    return (
      <>
        <HudButton
          busy={st?.busy}
          onClick={() => {
            setInv((s) => ({ ...s, [key]: { busy: true } }));
            void request({
              kind: "dispatch-check",
              siteId: c.siteId!,
              repoSlug: c.repoSlug!,
              checkKind: c.kind!,
              label: c.label,
            }).then((r) =>
              setInv((s) => ({ ...s, [key]: { busy: false, ok: r.ok, msg: r.message } })),
            );
          }}
        >
          ▶ investigate
        </HudButton>
        {st?.msg && !st.ok && <span className="chip failed">{st.msg}</span>}
      </>
    );
  };
  return { controls };
}

/** Collapsed checks: problems first (the fetcher pre-sorts), dispatchable inline. */
export function ChecksCompact({
  checks,
  request,
  limit = 8,
}: {
  checks: Checks;
  request: Request;
  limit?: number;
}): JSX.Element {
  const { controls } = useInvestigate(request);
  return (
    <>
      {checks.items.slice(0, limit).map((c) => (
        <div className="check-item" key={c.site}>
          <span className="site">{c.site}</span>
          <span className="check-side">
            {controls(c)}
            <span className={`chip ${c.verdict}`}>{c.label}</span>
          </span>
        </div>
      ))}
      {checks.items.length > limit && (
        <div className="more-note">+{checks.items.length - limit} more — expand for the fleet</div>
      )}
    </>
  );
}

/** Full-panel checks board — the whole fleet, investigations one click away. */
export function ChecksOverlay({
  checks,
  request,
  onClose,
}: {
  checks: Checks;
  request: Request;
  onClose: () => void;
}): JSX.Element {
  const { controls } = useInvestigate(request);
  const bad = checks.items.filter((c) => c.verdict !== "ok").length;
  return (
    <Overlay title={`Checks & deploys · ${bad} not green`} onClose={onClose}>
      {checks.items.map((c) => (
        <div className="check-item" key={c.site}>
          <span className="site">{c.site}</span>
          <span className="check-side">
            {controls(c)}
            <span className={`chip ${c.verdict}`}>{c.label}</span>
          </span>
        </div>
      ))}
    </Overlay>
  );
}
