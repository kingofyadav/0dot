"use client";

import { useActionState } from "react";
import { subscribeNewsletter } from "@/app/actions/newsletter";

export function NewsletterSubscribeForm({ creatorId, defaultEmail }: { creatorId: string; defaultEmail?: string }) {
  const [state, formAction, pending] = useActionState(subscribeNewsletter, undefined);

  return (
    <form action={formAction} style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
      <input type="hidden" name="creatorId" value={creatorId} />
      <label htmlFor={`newsletterEmail-${creatorId}`} className="srOnly">Email</label>
      <input
        id={`newsletterEmail-${creatorId}`}
        name="email"
        type="email"
        placeholder="you@example.com"
        defaultValue={defaultEmail}
        className="textInput"
        style={{ flex: 1, minWidth: "12rem" }}
        required
      />
      <button type="submit" className="button buttonSmall" disabled={pending}>
        {pending ? "Subscribing…" : "Subscribe"}
      </button>
      {state?.error && <p className="errorText" style={{ width: "100%", margin: "0.2rem 0 0" }}>{state.error}</p>}
    </form>
  );
}
