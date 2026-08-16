import { useState } from "react";
import type { ActionRequest, ActionResult, CaccPanelState, QueueTicket } from "@jarvis-ui/shared";
import { HudButton, Overlay } from "../../components";

type Request = (action: ActionRequest) => Promise<ActionResult>;
type Queue = CaccPanelState["queue"];

/** agents.tasks status → HUD chip class. */
function agentChipClass(status?: string): string {
  if (!status || status === "unmarked" || status === "fetched") return "queued";
  if (status === "error" || status === "deploy_failed") return "failed";
  if (status === "done" || status === "deployed") return "ok";
  return "running";
}

function AgentChip({ agent }: { agent: NonNullable<QueueTicket["agent"]> }): JSX.Element {
  return (
    <span className={`chip ${agentChipClass(agent.status)}`}>
      {agentChipClass(agent.status) === "running" && <span className="dot" />}
      agent #{agent.number ?? agent.taskId} · {(agent.status ?? "queued").replace(/_/g, " ")}
    </span>
  );
}

function KindChips({ t }: { t: QueueTicket }): JSX.Element {
  return (
    <>
      <span className={`chip ${t.kind === "bug" ? "urgent" : "queued"}`}>
        {t.kind === "bug" ? "bug" : "feat"}
      </span>
      {t.severity && (t.severity === "high" || t.severity === "critical") && (
        <span className="chip failed">{t.severity}</span>
      )}
    </>
  );
}

/** Collapsed queue: counts + the hottest undispatched tickets, one line each. */
export function QueueCompact({ queue }: { queue: Queue }): JSX.Element {
  return (
    <>
      <div className="count-banner">
        <div>
          <div className={queue.bugs > 0 ? "num crit" : "num"}>{queue.bugs}</div>
          <div className="lbl">open bugs</div>
        </div>
        <div>
          <div className="num">{queue.features}</div>
          <div className="lbl">feature reqs</div>
        </div>
      </div>
      <div>
        {queue.items.slice(0, 6).map((t) => (
          <div className="queue-line" key={t.id}>
            <KindChips t={t} />
            <span className="title">{t.title}</span>
            {t.agent ? (
              <span className={`chip ${agentChipClass(t.agent.status)}`}>
                #{t.agent.number ?? t.agent.taskId}
              </span>
            ) : (
              <span className="age">{t.age}</span>
            )}
          </div>
        ))}
        {queue.items.length > 6 && (
          <div className="more-note">+{queue.items.length - 6} more — expand to triage</div>
        )}
      </div>
    </>
  );
}

interface DispatchState {
  busy?: boolean;
  msg?: string;
  ok?: boolean;
}

/** Full-panel triage board: read tickets, dispatch agents, watch them work. */
export function QueueOverlay({
  queue,
  request,
  onClose,
}: {
  queue: Queue;
  request: Request;
  onClose: () => void;
}): JSX.Element {
  const [selected, setSelected] = useState<QueueTicket | null>(null);
  const [dispatch, setDispatch] = useState<Record<string, DispatchState>>({});

  const doDispatch = (t: QueueTicket): void => {
    setDispatch((d) => ({ ...d, [t.id]: { busy: true } }));
    void request({ kind: "dispatch-ticket", ticket: t.kind, ticketId: t.id }).then((r) => {
      setDispatch((d) => ({ ...d, [t.id]: { busy: false, ok: r.ok, msg: r.message } }));
    });
  };

  const dispatchControls = (t: QueueTicket): JSX.Element | null => {
    const ds = dispatch[t.id];
    if (ds?.ok) return <span className="chip ok">{ds.msg ?? "dispatched"}</span>;
    if (t.agent) return <AgentChip agent={t.agent} />;
    if (t.dispatchable) {
      return (
        <>
          <HudButton onClick={() => doDispatch(t)} busy={ds?.busy}>
            ▶ dispatch agent
          </HudButton>
          {ds?.msg && !ds.ok && <span className="chip failed">{ds.msg}</span>}
        </>
      );
    }
    return (
      <span className="chip queued">
        {t.repoSlug === null ? "no target repo" : "awaiting HQ triage"}
      </span>
    );
  };

  if (selected) {
    const t = queue.items.find((i) => i.id === selected.id) ?? selected;
    return (
      <Overlay
        title={`HQ queue · ${t.kind === "bug" ? "bug report" : "feature request"}`}
        onClose={onClose}
        right={
          <button type="button" className="expand-btn" onClick={() => setSelected(null)}>
            ← back
          </button>
        }
      >
        <div className="ticket-detail">
          <div className="ticket-head">
            <KindChips t={t} />
            <span className="chip queued">{t.status.replace(/_/g, " ")}</span>
            {t.repoSlug && <span className="chip queued">→ {t.repoSlug}</span>}
            {t.confidence != null && (
              <span className="chip queued">conf {Math.round(t.confidence * 100)}%</span>
            )}
          </div>
          <div className="meta">
            {t.submitter} · {t.system} · {t.age} ago
          </div>
          <div className="flow-line" aria-hidden />
          <pre className="ticket-body">{t.detail}</pre>
          {t.triage?.rootCause && (
            <div className="triage-block">
              <b>hypothesis</b>
              {t.triage.rootCause}
            </div>
          )}
          {t.triage?.proposedFix && (
            <div className="triage-block">
              <b>proposed fix</b>
              {t.triage.proposedFix}
            </div>
          )}
          <div className="ticket-actions">{dispatchControls(t)}</div>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay
      title={`HQ queue · ${queue.bugs} bugs · ${queue.features} feature requests`}
      onClose={onClose}
    >
      <div className="ticket-list">
        {queue.items.map((t) => (
          <div className="ticket-card" key={t.id}>
            <button type="button" className="ticket-main" onClick={() => setSelected(t)}>
              <div className="head">
                <KindChips t={t} />
                <span className="title">{t.title}</span>
              </div>
              <div className="meta">
                {t.submitter} · {t.system}
                {t.repoSlug ? ` → ${t.repoSlug}` : ""} · {t.age} ago ·{" "}
                {t.status.replace(/_/g, " ")}
              </div>
            </button>
            <div className="ticket-side">{dispatchControls(t)}</div>
          </div>
        ))}
        {queue.items.length === 0 && <div className="awaiting">queue clear, sir</div>}
      </div>
    </Overlay>
  );
}
