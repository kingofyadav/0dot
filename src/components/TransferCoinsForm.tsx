"use client";

import { useActionState } from "react";
import { transferCoinsAction } from "@/app/actions/wallet";
import { IdempotencyField } from "@/components/IdempotencyField";

// min/max passed from the server (wallet/page.tsx reads WALLET_LIMITS) rather
// than imported here directly — that module is `import "server-only"`, and
// this is a Client Component.
export function TransferCoinsForm({
  minCoins,
  maxCoins,
  coinBalance,
}: {
  minCoins: number;
  maxCoins: number;
  coinBalance: number;
}) {
  const [state, formAction, pending] = useActionState(transferCoinsAction, undefined);
  // Capped by the viewer's actual balance too (not just the wallet-wide
  // per-tx limit) — same "can't afford this" guard PurchaseVipForm/
  // CourseBuyButton give the viewer before they submit, via the native
  // <input max> so the browser rejects an unaffordable amount up front.
  const effectiveMax = Math.min(maxCoins, coinBalance);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <IdempotencyField />
      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        Username
        <input type="text" name="handle" placeholder="e.g. jane" required autoComplete="off" />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        Coins
        <input type="number" name="coinAmount" min={minCoins} max={effectiveMax} step={1} placeholder="1" required />
      </label>
      <button type="submit" className="button buttonSecondary buttonSmall" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Sending…" : "Send coins"}
      </button>
      {coinBalance < minCoins && (
        <p className="mutedText" style={{ fontSize: "0.8rem" }}>You have {coinBalance} coin{coinBalance === 1 ? "" : "s"} — not enough to send.</p>
      )}
      {state?.error && (
        <p className="errorText" role="alert">
          {state.error}
        </p>
      )}
      {state?.success && <p className="mutedText">Sent!</p>}
    </form>
  );
}
