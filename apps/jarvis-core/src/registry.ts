import type { CaccPanelState, MomentumPanelState, TopPanelState } from "@jarvis-ui/shared";
import { fetchCaccInbox } from "./subagents/cacc-comms.js";
import { fetchCaccChecks } from "./subagents/cacc-checks.js";
import { fetchCaccQueue } from "./subagents/cacc-queue.js";
import { fetchCaccFleet } from "./subagents/cacc-fleet.js";
import { fetchMomentumCrm } from "./subagents/momentum-crm.js";
import { fetchPersonalTasks } from "./subagents/personal-tasks.js";
import {
  fetchMomentumFleet,
  fetchMomentumInbox,
  fetchSpendToday,
  fetchSubscriptionsUsage,
} from "./subagents/stubs.js";

/**
 * Subagent registry (ARCHITECTURE.md §3): each data-owning panel is
 * assembled from the subagents that feed it. Every fetcher catches its own
 * errors and degrades to connected:false, so one broken upstream can't
 * stall a panel, let alone the loop. The core panel isn't here — its state
 * (voice/mode) lives in the orchestrator, not behind a connector.
 */

export async function buildCaccPanel(): Promise<CaccPanelState> {
  const [inbox, fleet, queue, checks] = await Promise.all([
    fetchCaccInbox(),
    fetchCaccFleet(),
    fetchCaccQueue(),
    fetchCaccChecks(),
  ]);
  return { inbox, fleet, queue, checks };
}

export async function buildMomentumPanel(): Promise<MomentumPanelState> {
  const [inbox, fleet, crm] = await Promise.all([
    fetchMomentumInbox(),
    fetchMomentumFleet(),
    fetchMomentumCrm(),
  ]);
  return { inbox, fleet, crm };
}

export async function buildTopPanel(): Promise<TopPanelState> {
  const [subscriptions, tasks, spendTodayUsd] = await Promise.all([
    fetchSubscriptionsUsage(),
    fetchPersonalTasks(),
    fetchSpendToday(),
  ]);
  return { subscriptions, tasks, spendTodayUsd };
}
