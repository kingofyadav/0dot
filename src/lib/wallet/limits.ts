import "server-only";

// addendum-coin-wallet-v2.md §5.1 — the single source of truth for every
// wallet limit, imported by both the web actions and the API routes so the
// two rails can never drift (fixes review finding #10). All coin figures
// here are WHOLE COINS; multiply by COIN_UNIT for the minor units the
// ledger stores. Starting values — product/finance to confirm (§18).

export const COIN_UNIT = 100; // 1 coin = 100 minor units
export const USD_PER_COIN = 1; // fixed peg, closed loop (§3, §4.1)

export const WALLET_LIMITS = {
  COIN_UNIT,

  // Signup grant — restricted (promo bucket) + expiring, so a throwaway
  // account can't farm transferable coins (fixes #16).
  SIGNUP_GRANT_COINS: 1,
  SIGNUP_GRANT_TTL_DAYS: 90,

  // Launch promo (§8.1) — one free month of Premium for accounts created
  // before LAUNCH_PROMO_ENDS_AT, on top of the 1-coin base grant. Restricted
  // + expiring. LAUNCH_PROMO_ENDS_AT is env-overridable
  // (WALLET_LAUNCH_PROMO_ENDS_AT) so product can extend or cut the window
  // without a deploy.
  LAUNCH_PROMO_COINS: 6, // = one month of profile_premium
  LAUNCH_PROMO_TTL_DAYS: 90,

  // Referral rewards (§7.5) — paid only after the invitee verifies their
  // email AND does one meaningful action, so a throwaway account earns
  // nothing. Both sides land in the restricted (promo) bucket.
  REFERRAL_REWARD_INVITER_COINS: 3,
  REFERRAL_REWARD_INVITEE_COINS: 3,
  REFERRAL_REWARD_TTL_DAYS: 90,
  REFERRAL_MAX_REWARDED_INVITES_PER_INVITER: 25, // lifetime anti-farm ceiling
  REFERRAL_COOKIE_MAX_AGE_S: 30 * 24 * 60 * 60,

  // P2P transfer (spendable bucket only — promo is never a transfer source).
  // §5.2/§11.2: eligibility + velocity are the riskiest surface (§3.4).
  TRANSFER_MIN_COINS: 1,
  TRANSFER_MAX_COINS_PER_TX: 20,
  TRANSFER_MAX_COINS_PER_DAY: 100,
  TRANSFER_MAX_RECIPIENTS_PER_DAY: 10,
  TRANSFER_MIN_ACCOUNT_AGE_HOURS: 24, // fixes #16 — no fresh-account faucet

  // Grant kinds whose unspent remainder the promo-expiry sweep claws back.
  GRANT_KINDS: ["signup_grant", "promo_grant", "referral_reward"] as const,

  // Admin issuance controls (§11.3, fixes #15). The dual-control threshold
  // is, for now, a hard ceiling on the self-serve grant tool — amounts over
  // it need finance sign-off out of band (the CoinGrantApproval queue is a
  // later addition). Every grant/adjustment is still audited and capped.
  ADMIN_ADJUST_MAX_COINS_PER_ADMIN_PER_DAY: 5_000,
  ADMIN_ADJUST_DUAL_CONTROL_THRESHOLD_COINS: 1_000,

  // Business wallets (§6.5) — spend-only on platform goods, never P2P.
  // Matches isBusinessStaff (src/lib/businesses.ts): editor/member can view
  // the balance + statement but not spend.
  BUSINESS_SPEND_ROLES: ["owner", "admin"] as const,
} as const;

// Default: v2 ship date (2026-08-30) + 90 days. Env override wins.
const LAUNCH_PROMO_ENDS_AT_DEFAULT = "2026-11-28T00:00:00.000Z";
export function launchPromoEndsAt(): Date {
  return new Date(process.env.WALLET_LAUNCH_PROMO_ENDS_AT || LAUNCH_PROMO_ENDS_AT_DEFAULT);
}

export function coinsToUnits(coins: number): number {
  return Math.round(coins * COIN_UNIT);
}

// Fallback ledger idempotency key for a "repeatable" coin action (tip,
// donation, membership, ticket, subscription) that has no natural
// uniqueness and whose caller supplied no per-submission token. The
// trailing time bucket only collapses near-simultaneous resubmits (a
// double-click, an Enter+click, a network retry); a JS client sends a
// unique token via <IdempotencyField> and goes through coinActionKey
// instead, so a *deliberate* repeat is never swallowed (review finding #1).
export function coinIdempotencyKey(...parts: Array<string | number>): string {
  return [...parts, Math.floor(Date.now() / 12_000)].join(":");
}

// A usable client-supplied idempotency token: a non-trivial string with no
// whitespace and no colon (the key separator). Covers crypto.randomUUID,
// the timestamp+random fallback in <IdempotencyField>, and an API caller's
// own body `idempotencyKey`. Anything shorter/looser falls back to the
// time bucket rather than becoming a weak or collision-prone key.
const CLIENT_TOKEN = /^[^\s:]{6,200}$/;

// The idempotency key for a repeatable coin action initiated from a form.
// Prefers the client's per-submission token so a double-click is deduped
// but a genuine repeat purchase is not; with no token (no-JS post, or a
// server-to-server caller) it falls back to coinIdempotencyKey's short
// time bucket. `scope` namespaces the action; `parts` pin it to the
// payer + target so one user's token can't touch another's.
export function coinActionKey(
  scope: string,
  token: unknown,
  ...parts: Array<string | number>
): string {
  if (typeof token === "string" && CLIENT_TOKEN.test(token.trim())) {
    return [scope, ...parts, token.trim()].join(":");
  }
  return coinIdempotencyKey(scope, ...parts);
}

// Ledger balances are always whole coins in Phase 1 (fractional pricing
// arrives with chargeWallet in Phase 2), so this division is exact today.
export function unitsToCoins(units: number): number {
  return units / COIN_UNIT;
}
