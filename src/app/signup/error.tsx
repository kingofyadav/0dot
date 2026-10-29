"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Scoped to /signup and /signup/recovery-codes (no layout.tsx in either
// segment, so this one boundary covers both — see file-conventions/error.md
// "wraps page.js, and nested layout.js files").
//
// auth.ts's signup()/acknowledgeRecoveryCodes() already return `{ error }`
// instead of throwing for every failure *inside* the action (docs/BUGS.md
// item 2, db3b5e1) — but that can only catch errors the action itself
// raises. A platform-level failure on the action's POST (confirmed live,
// 2026-10-29: a raw 503 straight from Vercel on both `POST /signup` and
// `POST /signup/recovery-codes`, same cross-region-to-Mumbai root cause as
// BUGS.md item 1) never reaches that try/catch at all — the fetch backing
// useActionState's dispatch (or, on the plain `<form action={...}>` on
// recovery-codes, the bare Server Function call) throws before any
// `{ error }` return is possible, and per Next's error-handling docs
// ("unhandled errors inside startTransition... bubble up to the nearest
// error boundary") that previously meant global-error.tsx — a full-page
// crash with no way back to the form, not the "something went wrong,
// retry" state the UI shows everywhere else. This stops it at the segment
// boundary with a one-click retry instead.
export default function SignupError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="authWrap">
      <div className="authCard">
        <h1>Something went wrong</h1>
        <p className="mutedText">
          That took longer than expected and didn&apos;t go through. Nothing was saved — it&apos;s
          safe to try again.
        </p>
        <button type="button" className="button" onClick={() => retry()}>
          Try again
        </button>
      </div>
    </div>
  );
}
