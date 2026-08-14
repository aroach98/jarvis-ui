import type { TopPanelState } from "@jarvis-ui/shared";
import { getEnv } from "../lib/env.js";
import { taskDueLabel, utcDatePlusDays } from "../lib/format.js";

interface TrackingTask {
  title: string;
  next_due: string;
  priority: string;
}

/**
 * Andrew OS (tracking.andrewroach.xyz) via PostgREST on the tracking schema.
 * Matches the app's own dashboard semantics (tracking src/lib/queries.ts):
 * active tasks, overdue = next_due < today (UTC), due-soon window 14 days.
 * Recurring tasks are never "done" — next_due just rolls — so done:false;
 * completed one-timers leave the active set entirely.
 */
export async function fetchPersonalTasks(): Promise<TopPanelState["tasks"]> {
  const url = getEnv("TRACKING_SUPABASE_URL");
  const key = getEnv("TRACKING_SERVICE_ROLE_KEY");
  if (!url || !key) {
    return {
      connector: {
        connected: false,
        reason: "TRACKING_SUPABASE_URL / TRACKING_SERVICE_ROLE_KEY missing from .env.local",
      },
      items: [],
    };
  }
  try {
    const horizon = utcDatePlusDays(14);
    const res = await fetch(
      `${url}/rest/v1/tasks?select=title,next_due,priority` +
        `&status=eq.active&next_due=not.is.null&next_due=lte.${horizon}` +
        `&order=next_due.asc&limit=14`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Accept-Profile": "tracking",
        },
      },
    );
    if (!res.ok) throw new Error(`PostgREST HTTP ${res.status}`);
    const tasks = (await res.json()) as TrackingTask[];
    return {
      connector: { connected: true },
      items: tasks.map((t) => ({
        label: t.priority === "critical" ? `❗ ${t.title}` : t.title,
        due: taskDueLabel(t.next_due),
        done: false,
      })),
    };
  } catch (err) {
    return {
      connector: { connected: false, reason: `Andrew OS: ${(err as Error).message}` },
      items: [],
    };
  }
}
