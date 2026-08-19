"use client";

import { useEffect, useState } from "react";
import { Trash2, X, Paperclip } from "lucide-react";
import { Modal } from "@/components/Modal";

export type MessageBubbleData = {
  id: string;
  body: string | null;
  createdAt: Date;
  senderId: string;
  attachmentType?: string | null;
  attachmentUrl?: string | null;
  attachmentMimeType?: string | null;
  attachmentDurationS?: number | null;
  deletedAt?: Date | null;
};

// toLocaleTimeString's AM/PM casing can differ between the server's ICU and
// the browser's (observed: "11:15 AM" server vs "11:15 am" client, same
// locale/timezone, different CLDR data) — a genuine hydration mismatch,
// not just a suppressible warning (suppressHydrationWarning didn't stop
// React from logging the failure and regenerating the tree here). Rendering
// nothing during SSR and filling in the formatted text after mount is the
// standard safe pattern: the hydration-time DOM matches exactly (both
// empty), and the real text only appears via a normal post-hydration state
// update, not a comparison.
function MessageTimestamp({ date }: { date: Date }) {
  const [text, setText] = useState("");

  // Deliberate: this IS the "detect client environment, defer the value
  // until after mount" case the lint rule below can't distinguish from a
  // real anti-pattern. Formatting *during* render would reintroduce the
  // hydration mismatch this component exists to avoid.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));
  }, [date]);

  return (
    <time
      dateTime={date.toISOString()}
      className="mutedText"
      style={{ fontSize: "0.7rem", display: "block", marginTop: "0.2rem" }}
    >
      {text}
    </time>
  );
}

// Sender-aligned single message. Attachment fields are optional/nullable so
// this already works for the text-only core loop (spec §5, build steps 6-8)
// before attachments (step 9) add real values for them.
//
// onDelete is only ever passed for the sender's own, not-yet-deleted
// messages (ConversationView decides that, see its render) — deletion is
// sender-only per spec §5.1, so a non-owner bubble never gets the control.
export function MessageBubble({
  message,
  isOwn,
  onDelete,
}: {
  message: MessageBubbleData;
  isOwn: boolean;
  onDelete?: (messageId: string) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (message.deletedAt) {
    return (
      <div
        className={`messageBubble${isOwn ? " messageBubbleSelf" : ""}`}
        style={{ alignSelf: isOwn ? "flex-end" : "flex-start" }}
      >
        <p className="mutedText" style={{ margin: 0, fontStyle: "italic" }}>
          Message deleted
        </p>
        <MessageTimestamp date={message.createdAt} />
      </div>
    );
  }

  return (
    <div
      className={`messageBubble${isOwn ? " messageBubbleSelf" : ""}`}
      style={{ alignSelf: isOwn ? "flex-end" : "flex-start", position: "relative" }}
    >
      {message.attachmentType === "voice_note" && message.attachmentUrl && (
        <audio controls src={message.attachmentUrl} style={{ maxWidth: "220px" }} />
      )}
      {message.attachmentType === "file" && message.attachmentUrl && (
        <a
          href={message.attachmentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="messageAttachmentFile"
          style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
        >
          <Paperclip size={14} /> {message.attachmentMimeType ?? "Attachment"}
        </a>
      )}
      {message.body && <p style={{ margin: 0 }}>{message.body}</p>}
      <MessageTimestamp date={message.createdAt} />
      {isOwn && onDelete && (
        <>
          <button
            type="button"
            className="button buttonSecondary iconButton messageDeleteTrigger"
            aria-label="Delete message"
            title="Delete message"
            onClick={() => setConfirmOpen(true)}
            style={{
              position: "absolute",
              top: "-0.6rem",
              insetInlineStart: "-0.6rem",
              padding: "0.25rem",
            }}
          >
            <Trash2 size={13} aria-hidden="true" />
          </button>
          <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Delete this message?">
            <p>This can&apos;t be undone. It&apos;ll be replaced with &ldquo;Message deleted&rdquo; for everyone in this conversation.</p>
            <div className="modalActions">
              <button type="button" className="button buttonSecondary" onClick={() => setConfirmOpen(false)}>
                <X size={16} aria-hidden="true" />
                Cancel
              </button>
              <button
                type="button"
                className="button buttonDanger"
                onClick={() => {
                  setConfirmOpen(false);
                  onDelete(message.id);
                }}
              >
                <Trash2 size={16} aria-hidden="true" />
                Delete
              </button>
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}
