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
      <button
        type="submit"
        className="button buttonSecondary iconButton"
        data-nav-like
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.3rem",
          transition: "color var(--transition-base), border-color var(--transition-base)",
          ...(optimistic.liked ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined),
        }}
        aria-pressed={optimistic.liked}
      >
        <Heart size={16} aria-hidden="true" fill={optimistic.liked ? "currentColor" : "none"} /> {formatCount(optimistic.count)}
      </button>
    </form>
  );
}
