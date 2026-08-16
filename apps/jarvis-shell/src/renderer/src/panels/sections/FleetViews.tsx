import { AGENT_PIPELINE } from "@jarvis-ui/shared";
import type { AgentTask, CaccPanelState } from "@jarvis-ui/shared";
import { Overlay } from "../../components";

type Fleet = CaccPanelState["fleet"];

/**
 * The AGENTS pipeline rail, mirrored from agents.cacadets.org's live board:
 * nine pips (clone → design → contract → worktree → install → code → build →
 * push → PR open), the current one tinted with its stage color and pulsing,
 * completed ones lit — so a task visibly flows left-to-right as agents work.
 */
function StageRail({ task }: { task: AgentTask }): JSX.Element {
  return (
    <div className="stage-rail" aria-hidden>
      {AGENT_PIPELINE.map((p, i) => {
        let cls = "pip";
        if (task.kind === "done" || task.kind === "deployed") cls += " done";
        else if (task.kind === "error") cls += " failed";
        else if (task.kind === "active" || task.kind === "review") {
          if (task.stageIdx >= 0 && i < task.stageIdx) cls += " done";
          else if (i === task.stageIdx) cls += task.kind === "review" ? " review" : " current";
        }
        return (
          <span
            key={p.id}
            className={cls}
            title={p.label}
            style={{ "--stage-color": p.color } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}

const KIND_COLOR: Record<AgentTask["kind"], string> = {
  active: "", // per-stage tint
  review: "#f9e2af",
  done: "#57e6a1",
  deployed: "#2dd4bf",
  error: "#ff6b6b",
  queued: "#6f8b93",
};

function TaskCard({ task }: { task: AgentTask }): JSX.Element {
  const stageColor =
    (task.kind === "active" && task.stageIdx >= 0
      ? AGENT_PIPELINE[task.stageIdx]?.color
      : undefined) ??
    (KIND_COLOR[task.kind] || "#6f8b93");
  const live = task.kind === "active" || task.kind === "review";
  return (
    <div
      className={`fleet-card ${task.kind}`}
      style={{ "--stage-color": stageColor } as React.CSSProperties}
    >
      <div className="fleet-row">
        <span className="repo">
          {task.repo} <b>#{task.number}</b>
        </span>
        <span className={`stage-label${live ? " live" : ""}`}>{task.stageLabel}</span>
        <span className="elapsed">{task.elapsed}</span>
      </div>
      <div className="fleet-row2">
        <StageRail task={task} />
        <span className="title">{task.title}</span>
      </div>
    </div>
  );
}

/** Collapsed fleet: the live rail cards, most active first. */
export function FleetCompact({ fleet }: { fleet: Fleet }): JSX.Element {
  const working = fleet.tasks.filter((t) => t.kind === "active" || t.kind === "review").length;
  return (
    <>
      <div className="fleet-summary">
        <span>
          <b>{working}</b> agent{working === 1 ? "" : "s"} working
        </span>
        <span className="spend">${fleet.spendTodayUsd.toFixed(2)} today</span>
      </div>
      {fleet.tasks.slice(0, 6).map((t) => (
        <TaskCard key={`${t.repo}#${t.number}`} task={t} />
      ))}
      {fleet.tasks.length === 0 && <div className="awaiting">no agents in flight</div>}
    </>
  );
}

/** Full-panel pipeline board — every live + recent task. */
export function FleetOverlay({
  fleet,
  onClose,
}: {
  fleet: Fleet;
  onClose: () => void;
}): JSX.Element {
  return (
    <Overlay
      title="AGENTS pipeline · agents.cacadets.org"
      onClose={onClose}
      right={<span className="spend">${fleet.spendTodayUsd.toFixed(2)} today</span>}
    >
      <div className="fleet-legend">
        {AGENT_PIPELINE.map((p) => (
          <span key={p.id} style={{ color: p.color }}>
            {p.label}
          </span>
        ))}
      </div>
      {fleet.tasks.map((t) => (
        <TaskCard key={`${t.repo}#${t.number}`} task={t} />
      ))}
      {fleet.tasks.length === 0 && <div className="awaiting">no agents in flight</div>}
    </Overlay>
  );
}
