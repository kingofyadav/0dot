"use client";

import { useOptimistic } from "react";
import { Heart } from "lucide-react";
import { formatCount } from "@/lib/format";
import { toggleLike } from "@/app/actions/posts";

// Extracted from PostCard.tsx so the like count can update the instant a
// user clicks rather than waiting for the Server Action's revalidatePath to
// land — UX_GUIDELINES.md rule 1 ("every action must provide feedback")
// and rule 11 ("loading states never show a blank flash"). PostCard itself
// stays a Server Component; this is the one small client island it needs.
export function LikeButton({
  postId,
  liked,
  count,
}: {
  postId: string;
  liked: boolean;
  count: number;
}) {
  const [optimistic, setOptimistic] = useOptimistic(
    { liked, count },
    (state, nextLiked: boolean) => ({
      liked: nextLiked,
      count: state.count + (nextLiked ? 1 : -1),
    })
  );

  return (
    <form
      action={async (formData: FormData) => {
        setOptimistic(!optimistic.liked);
        await toggleLike(formData);
      }}
    >
      <input type="hidden" name="postId" value={postId} />
      {/* aria-label must contain the button's visible text verbatim (the
          count, when shown) — Lighthouse/axe's label-content-name-mismatch
          flags "Like" as the accessible name for a button whose visible
          content is just a number, since a voice-control user saying "click
          1" (what they see) wouldn't match a name of "Like". */}
      <button
        type="submit"
        className="postAction"
        data-nav-like
        data-like
        aria-pressed={optimistic.liked}
        aria-label={
          optimistic.count > 0
            ? `${optimistic.liked ? "Unlike" : "Like"}, ${formatCount(optimistic.count)} like${optimistic.count === 1 ? "" : "s"}`
            : optimistic.liked
              ? "Unlike"
              : "Like"
        }
      >
        <Heart size={16} aria-hidden="true" fill={optimistic.liked ? "currentColor" : "none"} />
        {optimistic.count > 0 ? formatCount(optimistic.count) : "Like"}
      </button>
    </form>
  );
}
