import type { CaccPanelState, InboxItem, MailDetail } from "@jarvis-ui/shared";
import { graphGet } from "../lib/graph.js";
import { inboxTime } from "../lib/format.js";

interface GraphMessage {
  id: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  subject?: string;
  bodyPreview?: string;
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
          "&$select=id,from,subject,bodyPreview,receivedDateTime,isRead,importance,flag",
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
        id: m.id,
        from: m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? "(unknown)",
        subject: m.subject ?? "(no subject)",
        time: inboxTime(m.receivedDateTime),
        urgent: isUrgent(m),
        unread: !m.isRead,
        preview: (m.bodyPreview ?? "").replace(/\s+/g, " ").trim().slice(0, 220),
      }));

    const flagged =
      flaggedCount["@odata.count"] ??
      messages.value.filter((m) => m.flag?.flagStatus === "flagged").length;
    return {
      connector: { connected: true },
      directives: { attention: flagged > 0 },
      unread: folder.unreadItemCount,
      flagged,
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

interface GraphMessageDetail {
  id: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  receivedDateTime: string;
  body?: { content?: string };
}

/**
 * Full message body for the expanded inbox view — fetched on demand (the
 * "mail-detail" action), never in the poll loop. Graph is asked for plain
 * text so the HUD renders no HTML.
 */
export async function fetchMailDetail(messageId: string): Promise<MailDetail> {
  const m = await graphGet<GraphMessageDetail>(
    `/me/messages/${encodeURIComponent(messageId)}` +
      "?$select=id,subject,from,toRecipients,receivedDateTime,body",
    { Prefer: 'outlook.body-content-type="text"' },
  );
  const who = (r?: { emailAddress?: { name?: string; address?: string } }) =>
    r?.emailAddress?.name ?? r?.emailAddress?.address ?? "(unknown)";
  return {
    id: m.id,
    from: who(m.from),
    fromAddress: m.from?.emailAddress?.address ?? "",
    to: (m.toRecipients ?? []).map(who),
    subject: m.subject ?? "(no subject)",
    receivedAt: inboxTime(m.receivedDateTime),
    body: (m.body?.content ?? "").replace(/\r\n/g, "\n").trim(),
  };
}
