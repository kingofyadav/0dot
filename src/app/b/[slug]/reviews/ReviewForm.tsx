"use client";

import { useActionState } from "react";
import { createOrUpdateReview } from "@/app/actions/reviews";

export function ReviewForm({
  businessId,
  existing,
}: {
  businessId: string;
  // Edit mode when set — createOrUpdateReview upserts on the
  // (businessId, authorId) unique constraint either way, one form covers
  // both, same reasoning as OfferingForm's create-vs-edit reuse.
  existing?: { rating: number; body: string };
}) {
  const [state, formAction, pending] = useActionState(createOrUpdateReview, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "32ch" }}>
      <input type="hidden" name="businessId" value={businessId} />
      <select name="rating" defaultValue={existing?.rating ?? 5} className="textInput">
        {[5, 4, 3, 2, 1].map((r) => (
          <option key={r} value={r}>
            {r} star{r !== 1 ? "s" : ""}
          </option>
        ))}
      </select>
      <textarea
        name="body"
        placeholder="Write a review (optional)"
        defaultValue={existing?.body}
        maxLength={2000}
        rows={3}
        className="textInput"
      />
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button buttonSmall" style={{ alignSelf: "flex-start" }} disabled={pending}>
        {pending ? "Saving…" : existing ? "Update review" : "Post review"}
      </button>
    </form>
  );
}
