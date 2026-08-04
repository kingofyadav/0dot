"use client";

import { useActionState } from "react";
import { createOrUpdateListingReview } from "@/app/actions/marketplace";

// Same upsert-on-unique-constraint shape as the Business ReviewForm
// (b/[slug]/reviews/ReviewForm.tsx) — one form covers create and edit.
export function ListingReviewForm({
  listingId,
  existing,
}: {
  listingId: string;
  existing?: { rating: number; body: string };
}) {
  const [state, formAction, pending] = useActionState(createOrUpdateListingReview, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "32ch" }}>
      <input type="hidden" name="listingId" value={listingId} />
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
