"use client";

import { useActionState, useState } from "react";
import { startDirectConversation } from "@/app/actions/messages";
import { Logo } from "@/components/Logo";

type Candidate = {
  userId: string;
  handle: string | null;
  displayName: string;
  avatarUrl: string | null;
};

// No global user search exists yet (ENGINEERING_ARCHITECTURE.md — a real,
// pre-existing Phase 1 gap, not something to build here) — candidates come
// from the viewer's own following/followedBy lists, same source
// suggested-users.ts already draws on for a not-yet-a-search picker.
// presetRecipient (set when arriving via a profile's "Message" button, see
// /messages/new/page.tsx) skips the picker entirely — that's the real path
// to messaging someone outside the follow graph.
export function NewMessageForm({
  candidates,
  presetRecipient,
}: {
  candidates: Candidate[];
  presetRecipient?: Candidate | null;
}) {
  const [state, formAction, pending] = useActionState(startDirectConversation, undefined);
  const [recipientId, setRecipientId] = useState<string | null>(presetRecipient?.userId ?? null);
  const [filter, setFilter] = useState("");
  // Client-side filter over the already-fetched candidates array — no
  // global user search exists (see this file's own comment above), so
  // there's no API to call; this just stops the picker from being an
  // unfilterable scroll once someone follows more than a handful of people.
  const lowerFilter = filter.trim().toLowerCase();
  const filteredCandidates = lowerFilter
    ? candidates.filter(
        (c) => c.displayName.toLowerCase().includes(lowerFilter) || c.handle?.toLowerCase().includes(lowerFilter)
      )
    : candidates;

  if (presetRecipient) {
    return (
      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <input type="hidden" name="recipientId" value={presetRecipient.userId} />
        <textarea
          name="body"
          className="textInput"
          placeholder={`Write your first message to ${presetRecipient.displayName}…`}
          rows={3}
          maxLength={4000}
          required
        />
        {state?.error && <p className="errorText">{state.error}</p>}
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </button>
      </form>
    );
  }

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {candidates.length > 5 && (
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name or username…"
          className="textInput"
        />
      )}
      <div className="conversationList" style={{ maxHeight: "320px", overflowY: "auto" }}>
        {candidates.length === 0 && (
          <p className="mutedText">Follow someone (or get followed) to start a conversation.</p>
        )}
        {candidates.length > 0 && filteredCandidates.length === 0 && (
          <p className="mutedText">No matches for &quot;{filter}&quot;.</p>
        )}
        {filteredCandidates.map((candidate) => (
          <label
            key={candidate.userId}
            className="profileLinkItem"
            style={{
              cursor: "pointer",
              borderColor: recipientId === candidate.userId ? "var(--accent)" : undefined,
              boxShadow: recipientId === candidate.userId ? "0 0 0 3px var(--accent-soft)" : undefined,
            }}
          >
            <input
              type="radio"
              name="recipientId"
              value={candidate.userId}
              checked={recipientId === candidate.userId}
              onChange={() => setRecipientId(candidate.userId)}
              style={{ marginRight: "0.6rem" }}
            />
            {candidate.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
              <img
                src={candidate.avatarUrl}
                alt=""
                width={32}
                height={32}
                style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
              />
            ) : (
              <span style={{ display: "inline-flex", borderRadius: "50%", flexShrink: 0 }}>
                <Logo size={32} />
              </span>
            )}
            <span style={{ marginLeft: "0.6rem" }}>
              <span style={{ fontWeight: 600, display: "block" }}>{candidate.displayName}</span>
              {candidate.handle && <span className="mutedText">0dot.in/{candidate.handle}</span>}
            </span>
          </label>
        ))}
      </div>

      <textarea
        name="body"
        className="textInput"
        placeholder="Write your first message…"
        rows={3}
        maxLength={4000}
        required
      />

      {state?.error && <p className="errorText">{state.error}</p>}

      <button type="submit" className="button" disabled={pending || !recipientId}>
        {pending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
