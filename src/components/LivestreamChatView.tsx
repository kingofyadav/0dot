"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { sendChatMessage, deleteChatMessage } from "@/app/actions/livestreams";

export type LivestreamChatMessageData = {
  id: string;
  body: string;
  senderId: string;
  sender: {
    username: { handle: string } | null;
    profile: { displayName: string } | null;
  };
};

const REFRESH_COALESCE_MS = 300;

// Same SSE-triggers-router.refresh shape as CommunityChatView.tsx — see
// that component's comment for why a plain refresh (not a client-side
// append) is enough here too.
export function LivestreamChatView({
  livestreamId,
  currentUserId,
  messages,
  canSend,
  canModerate,
}: {
  livestreamId: string;
  currentUserId?: string | null;
  messages: LivestreamChatMessageData[];
  canSend: boolean;
  canModerate: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const source = new EventSource(`/api/live/${livestreamId}/chat/stream`);
    source.onmessage = () => {
      if (pendingRef.current) return;
      pendingRef.current = setTimeout(() => {
        pendingRef.current = null;
        router.refresh();
      }, REFRESH_COALESCE_MS);
    };
    return () => {
      source.close();
      if (pendingRef.current) clearTimeout(pendingRef.current);
    };
  }, [livestreamId, router]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    if (!String(formData.get("body") ?? "").trim()) return;
    startTransition(async () => {
      // A rejected send (rate limit, stream ended mid-typing, etc.) must
      // not clear the composer — that reads as "sent" when the message
      // never actually landed, silently losing what the user typed.
      const result = await sendChatMessage(undefined, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setError(null);
      formRef.current?.reset();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "24rem" }}>
      <div ref={listRef} role="log" aria-live="polite" aria-label="Livestream chat" className="messageList">
        {messages.length === 0 && <p className="mutedText">No messages yet.</p>}
        {messages.map((m) => {
          const displayName = m.sender.profile?.displayName ?? m.sender.username?.handle ?? "Unknown";
          return (
            <div key={m.id} className="messageBubble" style={{ alignSelf: m.senderId === currentUserId ? "flex-end" : "flex-start" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                <strong style={{ fontSize: "0.8rem" }}>{displayName}</strong>
                {canModerate && (
                  <form action={deleteChatMessage}>
                    <input type="hidden" name="messageId" value={m.id} />
                    <button type="submit" className="button buttonSecondary iconButton" aria-label="Remove message">
                      <X size={14} />
                    </button>
                  </form>
                )}
              </div>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{m.body}</p>
            </div>
          );
        })}
      </div>

      {canSend ? (
        <form ref={formRef} onSubmit={handleSubmit} className="messageComposer">
          <input type="hidden" name="livestreamId" value={livestreamId} />
          <label htmlFor="live-chat-input" className="srOnly">Message</label>
          <textarea id="live-chat-input" name="body" rows={1} maxLength={500} placeholder="Send a message…" className="textInput" />
          <button type="submit" className="button" disabled={isPending}>
            {isPending ? "Sending…" : "Send"}
          </button>
          {error && <p className="errorText">{error}</p>}
        </form>
      ) : (
        <p className="mutedText" style={{ padding: "0.75rem 0" }}>
          Sign in with a qualifying subscription to chat.
        </p>
      )}
    </div>
  );
}
