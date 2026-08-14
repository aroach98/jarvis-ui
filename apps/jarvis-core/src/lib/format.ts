/** jarvis-core owns display formatting (packages/shared contract). */

/** "08:12" today, "Yesterday", else "Mon 8/11". */
export function inboxTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (dayDiff === 0) {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (dayDiff === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
}

/**
 * Task due labels on the tracking app's own semantics: plain UTC YYYY-MM-DD
 * date strings, "today" boundary at 00:00 UTC (see tracking src/lib/recur.ts).
 */
export function taskDueLabel(nextDue: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const days = Math.round((Date.parse(nextDue) - Date.parse(today)) / 86_400_000);
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return "due today";
  if (days === 1) return "tomorrow";
  return `in ${days}d`;
}

export function utcDatePlusDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
