"use client";

import { useEffect, useOptimistic, useState } from "react";
import { Check } from "lucide-react";
import { castVote } from "@/app/actions/polls";

type PollOption = { id: string; label: string; _count: { votes: number } };
type Poll = {
  closesAt: Date;
  allowsMultipleChoice: boolean;
  options: PollOption[];
};

// Plain helper, not called directly in the component body — Date.now() is
// an impure call react-hooks/purity flags when it's inline in render, but
// not when it's inside an ordinary function the component calls into (same
// pattern PostCard.tsx used before this block moved out of it).
function isPollClosed(closesAt: Date): boolean {
  return closesAt.getTime() <= Date.now();
}

// Extracted from PostCard.tsx as its own client island, same reasoning as
// LikeButton.tsx — a vote should move the bar/percentage instantly instead
// of waiting for castVote's revalidatePath to land (UX_GUIDELINES.md rules
// 1/11). Single-vs-multi-choice mutual-exclusivity mirrors the server's own
// logic in castVote (src/app/actions/polls.ts) purely for the optimistic
// preview — the server transaction is still the actual source of truth.
export function PollBlock({ poll, votedOptionIds }: { poll: Poll; votedOptionIds: Set<string> }) {
  const [optimistic, setOptimistic] = useOptimistic(
    { options: poll.options, voted: votedOptionIds },
    (state, optionId: string) => {
      const wasVoted = state.voted.has(optionId);
      const nextVoted = new Set(state.voted);

      if (poll.allowsMultipleChoice) {
        if (wasVoted) nextVoted.delete(optionId);
        else nextVoted.add(optionId);
      } else {
        nextVoted.clear();
        nextVoted.add(optionId);
      }

      const nextOptions = state.options.map((option) => {
        if (option.id === optionId) {
          return { ...option, _count: { votes: option._count.votes + (wasVoted ? -1 : 1) } };
        }
        if (!poll.allowsMultipleChoice && state.voted.has(option.id)) {
          return { ...option, _count: { votes: Math.max(0, option._count.votes - 1) } };
        }
        return option;
      });

      return { options: nextOptions, voted: nextVoted };
    }
  );

  const isClosed = isPollClosed(poll.closesAt);
  const totalVotes = optimistic.options.reduce((sum, o) => sum + o._count.votes, 0);

  // poll.closesAt.toLocaleDateString() formats in the runtime's timezone and
  // locale — UTC / server CLDR during SSR, the viewer's IST / en-IN on the
  // client — so computing it during render is a guaranteed hydration text
  // mismatch (React #418), which is exactly what MessageBubble's
  // MessageTimestamp documents. Render nothing for the date until after
  // mount, then fill it in with a normal state update.
  const [closesLabel, setClosesLabel] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClosesLabel(poll.closesAt.toLocaleDateString());
  }, [poll.closesAt]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        padding: "0.6rem",
      }}
    >
      {optimistic.options.map((option) => {
        const pct = totalVotes > 0 ? Math.round((option._count.votes / totalVotes) * 100) : 0;
        const voted = optimistic.voted.has(option.id);
        return (
          <form
            key={option.id}
            action={async (formData: FormData) => {
              setOptimistic(option.id);
              await castVote(formData);
            }}
          >
            <input type="hidden" name="pollOptionId" value={option.id} />
            <button
              type="submit"
              disabled={isClosed}
              className="button buttonSecondary"
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                position: "relative",
                overflow: "hidden",
                borderColor: voted ? "var(--accent)" : undefined,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${pct}%`,
                  background: "var(--accent-soft)",
                  transition: "width var(--transition-base)",
                }}
              />
              <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                {voted && <Check size={14} aria-hidden="true" />}
                {option.label}
              </span>
              <span className="mutedText" style={{ position: "relative", fontSize: "0.8rem" }}>
                {pct}% ({option._count.votes})
              </span>
            </button>
          </form>
        );
      })}
      <p className="mutedText" style={{ fontSize: "0.75rem", margin: 0 }}>
        {totalVotes} vote{totalVotes === 1 ? "" : "s"} ·{" "}
        {isClosed ? "Closed" : closesLabel ? `Closes ${closesLabel}` : "Open"}
      </p>
    </div>
  );
}
