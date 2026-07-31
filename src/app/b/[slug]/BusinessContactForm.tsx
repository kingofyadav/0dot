"use client";

import { useActionState } from "react";
import { sendContactMessage } from "@/app/actions/business-contact";

export function BusinessContactForm({ businessId, isLoggedIn }: { businessId: string; isLoggedIn: boolean }) {
  const [state, formAction, pending] = useActionState(sendContactMessage, undefined);

  if (state?.success) {
    return <p className="mutedText">Message sent.</p>;
  }

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "32ch" }}>
      <input type="hidden" name="businessId" value={businessId} />
      {!isLoggedIn && (
        <>
          <input type="text" name="senderName" placeholder="Your name" maxLength={100} required className="textInput" />
          <input type="email" name="senderEmail" placeholder="Your email" maxLength={200} required className="textInput" />
        </>
      )}
      <textarea name="body" placeholder="Message" maxLength={2000} rows={4} required className="textInput" />
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button buttonSmall" style={{ alignSelf: "flex-start" }} disabled={pending}>
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
