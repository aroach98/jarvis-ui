import { useState } from "react";
import type { ActionRequest, ActionResult, CaccPanelState, InboxItem, MailDetail } from "@jarvis-ui/shared";
import { Overlay } from "../../components";

type Request = (action: ActionRequest) => Promise<ActionResult>;
type Inbox = CaccPanelState["inbox"];

/**
 * Collapsed inbox: counts + a terse sender/subject line per mail. All the
 * detail (previews, bodies) lives behind the expand overlay.
 */
export function InboxCompact({ inbox }: { inbox: Inbox }): JSX.Element {
  return (
    <>
      <div className="count-banner">
        <div>
          <div className="num">{inbox.unread}</div>
          <div className="lbl">unread</div>
        </div>
        <div>
          <div className={inbox.flagged > 0 ? "num crit" : "num"}>{inbox.flagged}</div>
          <div className="lbl">flagged</div>
        </div>
      </div>
      <div>
        {inbox.items.slice(0, 6).map((m) => (
          <div className="mail-line" key={m.id}>
            <span className="time">{m.time}</span>
            <span className="from">{m.from}</span>
            <span className="subj">{m.subject}</span>
            {m.urgent && <span className="chip urgent">!</span>}
          </div>
        ))}
        {inbox.items.length > 6 && (
          <div className="more-note">+{inbox.items.length - 6} more — expand to read</div>
        )}
      </div>
    </>
  );
}

/** Full-panel inbox: every triaged mail with preview; click to read the body. */
export function InboxOverlay({
  inbox,
  request,
  onClose,
}: {
  inbox: Inbox;
  request: Request;
  onClose: () => void;
}): JSX.Element {
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const [detail, setDetail] = useState<MailDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const open = (m: InboxItem): void => {
    setSelected(m);
    setDetail(null);
    setError(null);
    setLoading(true);
    void request({ kind: "mail-detail", messageId: m.id }).then((r) => {
      setLoading(false);
      if (r.ok && r.mail) setDetail(r.mail);
      else setError(r.message ?? "failed to load message");
    });
  };

  if (selected) {
    return (
      <Overlay
        title="Inbox · message"
        onClose={onClose}
        right={
          <button type="button" className="expand-btn" onClick={() => setSelected(null)}>
            ← back
          </button>
        }
      >
        <div className="mail-detail">
          <div className="mail-detail-head">
            <div className="subject">{selected.subject}</div>
            <div className="meta">
              <b>{detail?.from ?? selected.from}</b>
              {detail?.fromAddress ? ` <${detail.fromAddress}>` : ""} · {selected.time}
            </div>
            {detail && detail.to.length > 0 && (
              <div className="meta dim">to: {detail.to.join(", ")}</div>
            )}
          </div>
          <div className="flow-line" aria-hidden />
          {loading && <div className="awaiting">retrieving message…</div>}
          {error && <div className="offline"><b>failed</b>{error}</div>}
          {detail && <pre className="mail-body">{detail.body || "(empty message)"}</pre>}
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay
      title={`Inbox · andrew.roach@cacadets.org · ${inbox.unread} unread`}
      onClose={onClose}
    >
      <div className="mail-list">
        {inbox.items.map((m) => (
          <button type="button" className="mail-card" key={m.id} onClick={() => open(m)}>
            <div className="from">
              {m.from}
              {m.urgent && <span className="chip urgent">urgent</span>}
              {m.unread && <span className="chip queued">unread</span>}
              <span className="time">{m.time}</span>
            </div>
            <div className="subj">{m.subject}</div>
            {m.preview && <div className="preview">{m.preview}</div>}
          </button>
        ))}
        {inbox.items.length === 0 && <div className="awaiting">inbox zero, sir</div>}
      </div>
    </Overlay>
  );
}
