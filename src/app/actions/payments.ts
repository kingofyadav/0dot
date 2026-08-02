"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { getPaymentProcessor } from "@/lib/payments";
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
