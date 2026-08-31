"use client";

import { useActionState, useState, useTransition } from "react";
import { purchaseProduct, requestDownloadUrl } from "@/app/actions/digital-products";

// spec §5: buy form for a non-owner, or a "Download" trigger for a buyer —
// same useActionState pattern as SubscribeForm.tsx for the purchase side.
// requestDownloadUrl isn't a form action (ActionState has no success-value
// channel) — it's called directly and the returned token URL is navigated
// to, same "plain async function from a use server file, called from a
// client component" shape as any other server action, just not via <form>.
export function DigitalProductCard({
  product,
  owned,
  cardAvailable,
  viewerCoins,
}: {
  product: { id: string; title: string; description: string; price: number; currency: string };
  owned: boolean;
  cardAvailable: boolean;
  viewerCoins: number;
}) {
  const [state, formAction, pending] = useActionState(purchaseProduct, undefined);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDownload() {
    setDownloadError(null);
    startTransition(async () => {
      const result = await requestDownloadUrl(product.id);
      if ("error" in result) setDownloadError(result.error);
      else window.location.href = result.url;
    });
  }

  return (
    <div>
      <p style={{ fontWeight: 600, fontSize: "0.9rem", margin: 0 }}>{product.title}</p>
      {product.description && <p className="mutedText" style={{ fontSize: "0.8rem", margin: "0.15rem 0" }}>{product.description}</p>}
      {owned ? (
        <>
          <button type="button" className="button buttonSmall" onClick={handleDownload} disabled={isPending}>
            {isPending ? "Preparing…" : "Download"}
          </button>
          {downloadError && <p className="errorText" style={{ margin: "0.2rem 0" }}>{downloadError}</p>}
        </>
      ) : (
        <form action={formAction}>
          <input type="hidden" name="productId" value={product.id} />
          {state?.error && <p className="errorText" style={{ margin: "0.2rem 0" }}>{state.error}</p>}
          {state?.success && <p className="mutedText" style={{ margin: "0.2rem 0", fontSize: "0.8rem" }}>Purchased — refresh to download.</p>}
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {cardAvailable && (
              <button type="submit" name="payWith" value="card" className="button buttonSmall" disabled={pending}>
                {pending ? "Buying…" : `Buy — ${product.price.toFixed(2)} ${product.currency.toUpperCase()}`}
              </button>
            )}
            <button
              type="submit"
              name="payWith"
              value="coins"
              className={cardAvailable ? "button buttonSmall buttonSecondary" : "button buttonSmall"}
              disabled={pending || viewerCoins < product.price}
            >
              {pending ? "Buying…" : `${product.price} coins`}
            </button>
          </div>
          {viewerCoins < product.price && (
            <p className="mutedText" style={{ margin: "0.2rem 0", fontSize: "0.8rem" }}>You have {viewerCoins} of {product.price} coins.</p>
          )}
        </form>
      )}
    </div>
  );
}
