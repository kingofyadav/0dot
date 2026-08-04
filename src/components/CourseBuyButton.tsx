"use client";

import { useActionState } from "react";
import { purchaseCourse } from "@/app/actions/courses";

export function CourseBuyButton({ courseId, price, currency }: { courseId: string; price: number; currency: string }) {
  const [state, formAction, pending] = useActionState(purchaseCourse, undefined);

  return (
    <form action={formAction}>
      <input type="hidden" name="courseId" value={courseId} />
      {state?.error && <p className="errorText" style={{ margin: "0.2rem 0" }}>{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Buying…" : `Buy — ${price.toFixed(2)} ${currency.toUpperCase()}`}
      </button>
    </form>
  );
}
