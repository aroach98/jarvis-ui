import type { CaccPanelState, MomentumPanelState, TopPanelState } from "@jarvis-ui/shared";

/**
 * The four known-blocked subagents (ARCHITECTURE.md §8, CLAUDE.md). Each
 * returns an honest connected:false with the reason the UI should show —
 * never fabricated data. Promote one to its own module when its blocker
 * clears.
 */

export async function fetchCaccFleet(): Promise<CaccPanelState["fleet"]> {
  return {
    connector: { connected: false, reason: "agents schema has no org filter yet" },
    spendTodayUsd: 0,
    runs: [],
  };
}

export async function fetchMomentumFleet(): Promise<MomentumPanelState["fleet"]> {
  return {
    connector: { connected: false, reason: "agents schema has no org filter yet" },
    spendTodayUsd: 0,
    runs: [],
  };
}

export async function fetchMomentumInbox(): Promise<MomentumPanelState["inbox"]> {
  return {
    connector: { connected: false, reason: "Momentum mailbox not identified yet" },
    unread: 0,
    dueThisWeek: 0,
    items: [],
  };
}

export async function fetchSubscriptionsUsage(): Promise<TopPanelState["subscriptions"]> {
  return {
    connector: {
      connected: false,
      reason: "usage.andrewroach.xyz backend unexplored — connector not designed yet",
    },
    items: [],
  };
}

export async function fetchSpendToday(): Promise<TopPanelState["spendTodayUsd"]> {
  return {
    connector: { connected: false, reason: "no token-spend ledger exists yet" },
    total: 0,
    byWorld: {},
  };
}
