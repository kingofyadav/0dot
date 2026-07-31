"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/actions/auth";

export function RequestSlotButton({
  offeringId,
  startsAt,
  label,
  formAction,
}: {
  offeringId: string;
  startsAt: string;
  label: string;
  formAction: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, action, pending] = useActionState(formAction, undefined);

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
      <input type="hidden" name="offeringId" value={offeringId} />
      <input type="hidden" name="startsAt" value={startsAt} />
      <button type="submit" className="button buttonSecondary buttonSmall" disabled={pending}>
        {pending ? "Requesting…" : label}
      </button>
      {state?.error && <p className="errorText" style={{ fontSize: "0.75rem", margin: 0 }}>{state.error}</p>}
    </form>
  );
}
