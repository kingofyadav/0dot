import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { recordPaymentTransaction } from "@/lib/payments";

// spec §7.2: last-click within 30 days. Relying on the cookie's own Max-Age
// to expire is what actually implements "within 30 days" here — once the
// browser drops the cookie, there's nothing left to attribute to, so no
// separate clickedAt-vs-now comparison is needed at read time.
export const AFFILIATE_COOKIE_NAME = "aff";
export const AFFILIATE_ATTRIBUTION_WINDOW_S = 30 * 24 * 60 * 60;

// spec §7.3: attribution is last-click, applied consistently — whichever
// affiliate code is in the cookie right now is the one credited, never
// first-click or all-clicks-credited (that's what avoids double-counted
// commission across multiple affiliates promoting the same sale).
export async function getAttributedAffiliateLink(
  offeringType: string,
  offeringId: string,
  excludeUserId: string
) {
  const store = await cookies();
  const code = store.get(AFFILIATE_COOKIE_NAME)?.value;
  if (!code) return null;

  const link = await db.affiliateLink.findUnique({
    where: { code },
    include: { program: true },
  });
  if (!link) return null;
  if (link.program.status !== "active") return null;
  if (link.program.offeringType !== offeringType || link.program.offeringId !== offeringId) return null;
  if (link.affiliateId === excludeUserId) return null; // no self-referral credit

  return link;
}

// spec §7.3's literal criterion: commission is only calculated/credited on
// a successful PaymentTransaction, called from inside the same
// db.$transaction the sale's own ledger write happens in — never on a
// click alone. §7.2's explicit decision: if the affiliate has no active
// payout account yet, the conversion still records (the earned commission
// isn't lost) but the PaymentTransaction stays pending until they onboard.
export async function creditAffiliateConversion(
  tx: Prisma.TransactionClient,
  params: {
    affiliateLink: { id: string; affiliateId: string; program: { commissionPercent: number } };
    saleAmount: number;
    currency: string;
    saleProcessorReference: string;
  }
): Promise<{ affiliateId: string } | null> {
  const commissionAmount =
    Math.round(params.saleAmount * (params.affiliateLink.program.commissionPercent / 100) * 100) / 100;
  if (commissionAmount <= 0) return null;

  const payoutAccount = await tx.creatorPayoutAccount.findUnique({
    where: { userId: params.affiliateLink.affiliateId },
  });
  const status = payoutAccount?.status === "active" ? "succeeded" : "pending";

  const transaction = await recordPaymentTransaction(tx, {
    kind: "affiliate_commission",
    payerId: null,
    payeeId: params.affiliateLink.affiliateId,
    amount: commissionAmount,
    currency: params.currency,
    processorReference: `${params.saleProcessorReference}_aff`,
    status,
    relatedObjectType: "affiliate_link",
    relatedObjectId: params.affiliateLink.id,
  });

  await tx.affiliateConversion.create({
    data: {
      affiliateLinkId: params.affiliateLink.id,
      paymentTransactionId: transaction.id,
      commissionAmount,
    },
  });

  return { affiliateId: params.affiliateLink.affiliateId };
}
