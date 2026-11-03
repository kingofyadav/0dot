// Display a coin amount (addendum-wallet-only-payments.md §4.1: every price
// is a coin price). Whole amounts print bare, fractional ones to cents.
// Dependency-free so client and server components can both use it.
//
// FIX_PLAN P2: several DB columns this feeds are Float, not Int
// (Offering/DigitalProduct/Course.price, FundraisingCampaign.raisedAmount,
// CoinTransfer-adjacent aggregates, ...), and a running total accumulated
// from many Float additions can land a hair off an exact cent (binary
// floating point can't represent 0.1 exactly). Plain `.toFixed(2)` rounds
// those the wrong way right at a .xx5 boundary — the textbook
// `(1.005).toFixed(2) === "1.00"` bug — because the value stored is
// already a hair *below* 1.005. Nudging by Number.EPSILON before rounding
// pushes it back onto the correct side before toFixed sees it.
// Shared numeric half of the fix above — any other call site that needs to
// persist or compare a cent-rounded coin amount should use this instead of
// re-deriving the same Number.EPSILON nudge independently.
export function roundToCents(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function formatCoins(amount: number): string {
  const n = Number.isInteger(amount) ? amount.toLocaleString("en-US") : roundToCents(amount).toFixed(2);
  return `${n} coin${amount === 1 ? "" : "s"}`;
}
