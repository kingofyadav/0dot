"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { getPaymentProcessor } from "@/lib/payments";
import { isBusinessStaff } from "@/lib/businesses";
import { meetsPayoutAgeFloor, PAYOUT_MINIMUM_AGE_YEARS } from "@/lib/age-controls";
import type { ActionState } from "@/app/actions/auth";

// spec §3: idempotent so the settings UI can safely re-POST — a second
// call on an already-`active` account is a no-op rather than an error, and
// a second call while still `onboarding` just re-checks with the processor
// instead of creating a duplicate row (userId is unique on
// CreatorPayoutAccount).
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState requires this exact (prevState, formData) signature; the action itself takes no input fields.
export async function startCreatorOnboarding(_prevState: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();

  const existing = await db.creatorPayoutAccount.findUnique({ where: { userId: user.id } });
  if (existing?.status === "active") return undefined;

  // phase-12 spec §8.3: ties age verification into the payout onboarding
  // gate itself, rather than a general-purpose field this flow never
  // checks — an unknown DOB is the same default-deny as an under-floor one
  // (§8.4), so this doubles as the nudge toward the AgeGatePrompt above.
  if (!meetsPayoutAgeFloor(user.dateOfBirth)) {
    return { error: `You must be at least ${PAYOUT_MINIMUM_AGE_YEARS} and have confirmed your date of birth to enable payouts.` };
  }

  const result = await getPaymentProcessor().createPayoutAccount({ id: user.id, email: user.email });

  await db.creatorPayoutAccount.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      processor: getPaymentProcessor().name,
      processorAccountId: result.processorAccountId,
      status: result.status,
    },
    update: {
      processorAccountId: result.processorAccountId,
      status: result.status,
    },
  });

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
  return undefined;
}

// phase-8 spec §5.2: same idempotent onboarding shape as
// startCreatorOnboarding, keyed on businessId instead of userId — lets a
// business host activate payouts so its paid TicketTypes have somewhere to
// receive ticket revenue (purchaseTicket, events.ts, requires this to
// already be active before charging, same "no auto-provision on the fly"
// posture sendTip already established for individual creators).
export async function startBusinessPayoutOnboarding(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const businessId = String(formData.get("businessId") ?? "");

  if (!(await isBusinessStaff(businessId, user.id))) {
    return { error: "Only the owner or an admin can enable payouts for this business." };
  }

  const existing = await db.creatorPayoutAccount.findUnique({ where: { businessId } });
  if (existing?.status === "active") return undefined;

  const result = await getPaymentProcessor().createPayoutAccount({ id: businessId, email: user.email });

  await db.creatorPayoutAccount.upsert({
    where: { businessId },
    create: {
      businessId,
      processor: getPaymentProcessor().name,
      processorAccountId: result.processorAccountId,
      status: result.status,
    },
    update: {
      processorAccountId: result.processorAccountId,
      status: result.status,
    },
  });

  return undefined;
}
