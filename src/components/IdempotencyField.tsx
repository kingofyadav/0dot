"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

function safeUuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 12)}`;
  }
}

// A hidden field carrying a per-submission idempotency key for a coin
// purchase form. The key is generated on the client after mount and rotated
// once each submission settles, so a double-click or retry of the *same*
// submission reuses it (deduped in postTransaction) while a deliberate
// repeat purchase a moment later gets a fresh key and is not collapsed onto
// the previous charge (review finding #1). With no JS the field renders
// empty and the server falls back to coinIdempotencyKey's short time
// bucket. Generated post-mount (not during render) because the value must
// differ between the SSR pass and the client — same hydration-mismatch
// avoidance as PollBlock's date label.
export function IdempotencyField({ name = "idempotencyKey" }: { name?: string }) {
  const { pending } = useFormStatus();
  const [key, setKey] = useState("");
  const wasPending = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKey(safeUuid());
  }, []);

  useEffect(() => {
    if (wasPending.current && !pending && key) setKey(safeUuid());
    wasPending.current = pending;
  }, [pending, key]);

  return <input type="hidden" name={name} value={key} readOnly />;
}
