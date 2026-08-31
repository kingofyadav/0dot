"use client";

import { useActionState } from "react";
import { purchaseCourse } from "@/app/actions/courses";

export function CourseBuyButton({
  courseId,
  price,
  currency,
  cardAvailable,
  viewerCoins,
}: {
  courseId: string;
  price: number;
  currency: string;
  cardAvailable: boolean;
  viewerCoins: number;
}) {
  const [state, formAction, pending] = useActionState(purchaseCourse, undefined);

  return (
    <form action={formAction}>
      <input type="hidden" name="courseId" value={courseId} />
      {state?.error && <p className="errorText" style={{ margin: "0.2rem 0" }}>{state.error}</p>}
      {state?.success && <p className="mutedText" style={{ margin: "0.2rem 0", fontSize: "0.85rem" }}>You now have access.</p>}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {cardAvailable && (
          <button type="submit" name="payWith" value="card" className="button" disabled={pending}>
            {pending ? "Buying…" : `Buy — ${price.toFixed(2)} ${currency.toUpperCase()}`}
          </button>
        )}
        <button
          type="submit"
          name="payWith"
          value="coins"
          className={cardAvailable ? "button buttonSecondary" : "button"}
          disabled={pending || viewerCoins < price}
        >
          {pending ? "Buying…" : `${price} coins`}
        </button>
      </div>
      {viewerCoins < price && (
        <p className="mutedText" style={{ margin: "0.2rem 0", fontSize: "0.8rem" }}>You have {viewerCoins} of {price} coins.</p>
      )}
    </form>
  );
}
