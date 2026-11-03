"use client";

import { useState } from "react";

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="button buttonSecondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard access can be denied/unavailable (insecure context,
          // permission policy, some embedded webviews) — same guard
          // RecoveryCodeList/ReferralLinkCard already wrap this call in.
        }
      }}
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
