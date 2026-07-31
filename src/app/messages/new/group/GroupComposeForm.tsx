"use client";

import { useActionState, useState } from "react";
import { createGroupConversation } from "@/app/actions/messages";
import { Logo } from "@/components/Logo";

type Candidate = {
  userId: string;
  handle: string | null;
  displayName: string;
  avatarUrl: string | null;
};

export function GroupComposeForm({ candidates }: { candidates: Candidate[] }) {
  const [state, formAction, pending] = useActionState(createGroupConversation, undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <input type="text" name="title" className="textInput" placeholder="Group name (optional)" maxLength={100} />

      <div className="conversationList" style={{ maxHeight: "320px", overflowY: "auto" }}>
        {candidates.length === 0 && (
          <p className="mutedText">Follow someone (or get followed) to add them to a group.</p>
        )}
        {candidates.map((candidate) => (
          <label
            key={candidate.userId}
            className="profileLinkItem"
            style={{
              cursor: "pointer",
              borderColor: selected.has(candidate.userId) ? "var(--accent)" : undefined,
              boxShadow: selected.has(candidate.userId) ? "0 0 0 3px var(--accent-soft)" : undefined,
            }}
          >
            <input
              type="checkbox"
              name="participantIds"
              value={candidate.userId}
              checked={selected.has(candidate.userId)}
              onChange={() => toggle(candidate.userId)}
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

      {state?.error && <p className="errorText">{state.error}</p>}

      <button type="submit" className="button" disabled={pending || selected.size === 0}>
        {pending ? "Creating…" : `Create group${selected.size > 0 ? ` (${selected.size + 1})` : ""}`}
      </button>
    </form>
  );
}
