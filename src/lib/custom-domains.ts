import "server-only";
import { randomBytes } from "crypto";
import dns from "dns/promises";
import { db } from "@/lib/db";
import type { CustomDomain } from "@/generated/prisma/client";

const EDGE_HOST = "edge.0dot.in";

// Stub edge IPs — 0dot has no real edge network, so apex-domain (A-record)
// verification checks against these placeholders instead of a real
// anycast range. Drawn from RFC 5737's TEST-NET-3 documentation block so
// they're obviously non-routable, not real infrastructure dressed up as
// fake. Subdomain verification (the common case, §4.2) needs none of
// this — it's a real dns.resolveCname lookup against dnsTarget below.
const EDGE_APEX_IPS = ["203.0.113.10", "203.0.113.11"];

// spec §9: proposed, not confirmed by product/finance.
const CLAIM_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // §4.3
const NONPAYMENT_GRACE_MS = 14 * 24 * 60 * 60 * 1000; // §8.2
const DORMANCY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // §5.3/§8.2

// spec §5.2: never reused, even across deleted rows — a random token makes
// that true by construction, the same "opaque token, checked and consumed"
// idiom OAuthAuthorizationCode already uses elsewhere in this codebase.
function generateDnsTarget(): string {
  return `${randomBytes(12).toString("hex")}.${EDGE_HOST}`;
}

export function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/\.$/, "");
}

// A bare heuristic (no dot before a non-empty label = apex) — good enough
// to default the claim form's isApex checkbox; the owner can override it
// since only they know their own DNS provider's actual setup.
export function looksLikeApex(domain: string): boolean {
  return domain.split(".").length <= 2;
}

export async function findClaimableConflict(domain: string): Promise<CustomDomain | null> {
  return db.customDomain.findUnique({ where: { domain } });
}

// spec §4.1: creates the row with a fresh dns_target immediately, before
// any DNS has been verified, so the owner has something concrete to point
// at. Caller (the server action) is responsible for the billing gate
// (§8.1) and the "one slot included" cap — this function only handles the
// claim mechanics themselves.
export async function claimCustomDomain(params: {
  ownerType: "profile" | "business";
  ownerId: string;
  domain: string;
  isApex: boolean;
}): Promise<CustomDomain> {
  const now = new Date();
  return db.customDomain.create({
    data: {
      ownerType: params.ownerType,
      ownerProfileId: params.ownerType === "profile" ? params.ownerId : null,
      ownerBusinessId: params.ownerType === "business" ? params.ownerId : null,
      domain: params.domain,
      isApex: params.isApex,
      dnsTarget: generateDnsTarget(),
      claimedAt: now,
      claimExpiresAt: new Date(now.getTime() + CLAIM_EXPIRY_MS),
      // The server action layer currently caps every owner at one included
      // slot (premium-profiles addendum §3.2/§9), so the first domain
      // claimed is always the only one — defaulting it primary means
      // getPrimaryLiveDomain (canonical-URL preference, spec §6.3) and the
      // proxy have something to key off without a separate "set primary"
      // step for the common one-domain case.
      isPrimary: true,
    },
  });
}

export function getDnsInstructions(domain: CustomDomain): { recordType: string; host: string; value: string; note: string } {
  // spec §4.2: apex domains can't use a CNAME per the DNS spec — surfaced
  // explicitly rather than giving every claim identical instructions.
  return domain.isApex
    ? {
        recordType: "A (or ALIAS/ANAME if your DNS provider supports it)",
        host: "@",
        value: EDGE_APEX_IPS.join(" or "),
        note: "Root/apex domains can't use a CNAME record. Some DNS providers don't support ALIAS/ANAME either — if yours doesn't, use a subdomain (e.g. links.yourdomain.com) instead.",
      }
    : {
        recordType: "CNAME",
        host: domain.domain.split(".")[0],
        value: domain.dnsTarget,
        note: "Works with any DNS provider.",
      };
}

// spec §3/§4.1: this single resolution check does double duty as both
// ownership proof and routing setup — a real DNS lookup, not a simulation,
// so it actually works if DNS is genuinely pointed here. §7.1's SSL
// provisioning is the one piece that's a documented stub (no real ACME
// client exists to provision against), simulated as immediately active
// once routing verifies, same posture as payments.ts's StubPaymentProcessor.
export async function verifyDomainRouting(customDomainId: string): Promise<"routing_verified" | "routing_failed"> {
  const row = await db.customDomain.findUniqueOrThrow({ where: { id: customDomainId } });

  let verified = false;
  try {
    if (row.isApex) {
      const addresses = await dns.resolve4(row.domain);
      verified = addresses.some((ip) => EDGE_APEX_IPS.includes(ip));
    } else {
      const cnames = await dns.resolveCname(row.domain);
      verified = cnames.some((c) => normalizeDomain(c) === normalizeDomain(row.dnsTarget));
    }
  } catch {
    verified = false; // NXDOMAIN, no records yet, etc. — not verified, not an error
  }

  const routingStatus = verified ? "routing_verified" : "routing_failed";
  await db.customDomain.update({
    where: { id: row.id },
    data: {
      routingStatus,
      lastHealthCheckAt: new Date(),
      ...(verified && row.sslStatus === "pending" ? { sslStatus: "active" } : {}),
    },
  });

  // Only a regression (a previously-working domain breaking) is worth
  // notifying about — not every failed poll while a fresh claim is still
  // mid-setup, which would fire on nearly every claim.
  if (!verified && row.routingStatus === "routing_verified") {
    const ownerUserId = await resolveOwnerUserId(row);
    if (ownerUserId) {
      const { notifyCustomDomainRoutingFailed } = await import("@/lib/notifications");
      await notifyCustomDomainRoutingFailed({ recipientId: ownerUserId, customDomainId: row.id });
    }
  }

  return routingStatus;
}

// Read path for the proxy (src/proxy.ts) — only a fully live domain
// (routing verified, SSL provisioned, not suspended/dormant/removed)
// serves content; everything else falls through to 0dot.in normally.
export function getLiveCustomDomainByHost(host: string) {
  return db.customDomain.findFirst({
    where: { domain: normalizeDomain(host), status: "active", routingStatus: "routing_verified", sslStatus: "active" },
    select: { ownerType: true, ownerProfileId: true, ownerBusinessId: true, isPrimary: true },
  });
}

// spec §6.3: the canonical-URL preference signal a public profile/business
// page's <head> renders — the custom domain if it's live and marked
// primary, never a hard redirect and never authoritative over the
// permanent 0dot.in URL (Phase 1 §3.5).
export async function getPrimaryLiveDomain(ownerType: "profile" | "business", ownerId: string): Promise<string | null> {
  const where = ownerType === "profile" ? { ownerProfileId: ownerId } : { ownerBusinessId: ownerId };
  const row = await db.customDomain.findFirst({
    where: { ...where, isPrimary: true, status: "active", routingStatus: "routing_verified", sslStatus: "active" },
    select: { domain: true },
  });
  return row?.domain ?? null;
}

// spec §5.3: removal is non-destructive — dormant, not deleted — so a
// stale DNS record left pointing at the old (now-orphaned) target can't be
// raced by someone else claiming the exact domain string before the owner
// necessarily gets around to removing their own DNS.
export async function releaseCustomDomain(customDomainId: string): Promise<void> {
  await db.customDomain.update({
    where: { id: customDomainId },
    data: { status: "dormant", dormantAt: new Date() },
  });
}

export async function setPrimaryCustomDomain(customDomainId: string, ownerType: "profile" | "business", ownerId: string): Promise<void> {
  const where = ownerType === "profile" ? { ownerProfileId: ownerId } : { ownerBusinessId: ownerId };
  await db.$transaction([
    db.customDomain.updateMany({ where, data: { isPrimary: false } }),
    db.customDomain.update({ where: { id: customDomainId }, data: { isPrimary: true } }),
  ]);
}

// --- Background sweep: routing polling, claim expiry, billing-lapse
// sequence, dormancy cleanup — the four things spec §10 calls out as
// needing to run on a schedule rather than only at claim time. Same
// module-scope setInterval + globalThis re-registration guard as every
// other scheduler in this codebase (dmca.ts, trending.ts, etc.).

async function pollUnverifiedRouting(): Promise<void> {
  const pending = await db.customDomain.findMany({
    where: { status: "active", routingStatus: { in: ["pending_dns", "routing_failed"] }, claimExpiresAt: { gt: new Date() } },
    select: { id: true },
  });
  for (const { id } of pending) await verifyDomainRouting(id);
}

// spec §4.3: an unverified claim past its grace window is released — the
// domain string becomes claimable again by anyone, since the claimant
// never actually proved control of it.
async function releaseExpiredClaims(): Promise<void> {
  await db.customDomain.deleteMany({
    where: { routingStatus: { not: "routing_verified" }, claimExpiresAt: { lt: new Date() } },
  });
}

// spec §8.2: grace period -> suspended_nonpayment -> dormant, driven off
// whether the owner currently holds an effectively-active PlatformSubscription
// for the plan that gates this domain (profile_premium for a profile-owned
// domain, business_subscription for a business-owned one) — mirrors
// platform-billing.ts's effectivelyActive shape rather than importing it,
// same "avoid a needless cross-module coupling for one shared where-clause"
// call made in payments.ts's fee-discount check.
const effectivelyActive = { OR: [{ status: "active" }, { status: "cancelled", currentPeriodEnd: { gt: new Date() } }] };

async function sweepBillingLapse(): Promise<void> {
  const rows = await db.customDomain.findMany({ where: { status: { in: ["active", "suspended_nonpayment"] } } });

  for (const row of rows) {
    const plan = row.ownerType === "profile" ? "profile_premium" : "business_subscription";
    const subscriberWhere = row.ownerType === "profile" ? { subscriberProfileId: row.ownerProfileId } : { subscriberBusinessId: row.ownerBusinessId };

    const activeSubscription = await db.platformSubscription.findFirst({ where: { plan, ...subscriberWhere, ...effectivelyActive } });
    if (activeSubscription) {
      if (row.status === "suspended_nonpayment") {
        await db.customDomain.update({ where: { id: row.id }, data: { status: "active" } });
      }
      continue;
    }

    const lastSubscription = await db.platformSubscription.findFirst({ where: { plan, ...subscriberWhere }, orderBy: { currentPeriodEnd: "desc" } });
    const lapseStartedAt = lastSubscription?.currentPeriodEnd ?? row.createdAt;
    const lapsedMs = Date.now() - lapseStartedAt.getTime();

    if (row.status === "active" && lapsedMs > NONPAYMENT_GRACE_MS) {
      await db.customDomain.update({ where: { id: row.id }, data: { status: "suspended_nonpayment" } });
      const { notifyCustomDomainSuspendedNonpayment } = await import("@/lib/notifications");
      const ownerUserId = await resolveOwnerUserId(row);
      if (ownerUserId) await notifyCustomDomainSuspendedNonpayment({ recipientId: ownerUserId, customDomainId: row.id });
    } else if (row.status === "suspended_nonpayment" && lapsedMs > NONPAYMENT_GRACE_MS + DORMANCY_RETENTION_MS) {
      await db.customDomain.update({ where: { id: row.id }, data: { status: "dormant", dormantAt: new Date() } });
    }
  }
}

// spec §5.3: dormant rows are fully removed (freeing the domain string)
// once the retention window elapses.
async function sweepDormancyExpiry(): Promise<void> {
  await db.customDomain.deleteMany({
    where: { status: "dormant", dormantAt: { lt: new Date(Date.now() - DORMANCY_RETENTION_MS) } },
  });
}

async function resolveOwnerUserId(row: CustomDomain): Promise<string | null> {
  if (row.ownerType === "profile" && row.ownerProfileId) {
    const profile = await db.profile.findUnique({ where: { id: row.ownerProfileId }, select: { userId: true } });
    return profile?.userId ?? null;
  }
  if (row.ownerType === "business" && row.ownerBusinessId) {
    const owner = await db.businessMember.findFirst({ where: { businessId: row.ownerBusinessId, role: "owner" }, select: { userId: true } });
    return owner?.userId ?? null;
  }
  return null;
}

const SWEEP_INTERVAL_MS = 30 * 60 * 1000; // routing polling doesn't need to be faster than this — the owner just set DNS and is willing to wait

const globalForCustomDomains = globalThis as unknown as { customDomainSchedulerStarted?: boolean };

export function startCustomDomainScheduler(): void {
  if (globalForCustomDomains.customDomainSchedulerStarted) return;
  globalForCustomDomains.customDomainSchedulerStarted = true;

  const tick = () =>
    void (async () => {
      await pollUnverifiedRouting();
      await releaseExpiredClaims();
      await sweepBillingLapse();
      await sweepDormancyExpiry();
    })();
  tick();
  setInterval(tick, SWEEP_INTERVAL_MS);
}
