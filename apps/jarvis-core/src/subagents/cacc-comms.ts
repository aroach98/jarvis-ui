import type { CaccPanelState, InboxItem } from "@jarvis-ui/shared";
import { graphGet } from "../lib/graph.js";
import { inboxTime } from "../lib/format.js";

interface GraphMessage {
  from?: { emailAddress?: { name?: string; address?: string } };
  subject?: string;
  receivedDateTime: string;
  isRead: boolean;
  importance?: string;
  flag?: { flagStatus?: string };
}

/** andrew.roach@cacadets.org inbox triage via Microsoft Graph. */
export async function fetchCaccInbox(): Promise<CaccPanelState["inbox"]> {
  try {
    const [folder, messages, flaggedCount] = await Promise.all([
      graphGet<{ unreadItemCount: number }>("/me/mailFolders/inbox?$select=unreadItemCount"),
      graphGet<{ value: GraphMessage[] }>(
        "/me/mailFolders/inbox/messages?$top=40&$orderby=receivedDateTime desc" +
          "&$select=from,subject,receivedDateTime,isRead,importance,flag",
      ),
      graphGet<{ "@odata.count"?: number }>(
        "/me/mailFolders/inbox/messages?$filter=flag/flagStatus eq 'flagged'&$count=true&$top=1",
        { ConsistencyLevel: "eventual" },
      ).catch(() => ({}) as { "@odata.count"?: number }),
    ]);

    const isUrgent = (m: GraphMessage) =>
      m.flag?.flagStatus === "flagged" || m.importance === "high";
    const items: InboxItem[] = messages.value
      .filter((m) => !m.isRead || isUrgent(m))
      .slice(0, 12)
      .map((m) => ({
        from: m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? "(unknown)",
        subject: m.subject ?? "(no subject)",
        time: inboxTime(m.receivedDateTime),
        urgent: isUrgent(m),
      }));

    return {
      connector: { connected: true },
      unread: folder.unreadItemCount,
      flagged:
        flaggedCount["@odata.count"] ??
        messages.value.filter((m) => m.flag?.flagStatus === "flagged").length,
      items,
    };
  } catch (err) {
    return {
      connector: { connected: false, reason: `Graph mailbox: ${(err as Error).message}` },
      unread: 0,
      flagged: 0,
      items: [],
    };
  }
}
