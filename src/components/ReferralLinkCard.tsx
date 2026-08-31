"use client";

import { useState } from "react";

// §13.1's "Invite & earn" — shows the share link and a copy button, plus
// "N of M invites rewarded".
export function ReferralLinkCard({
  joinUrl,
  rewardedInvites,
  maxRewarded,
  rewardCoins,
}: {
  joinUrl: string;
  rewardedInvites: number;
  maxRewarded: number;
  rewardCoins: number;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the input is still selectable */
    }
  }

  return (
    <div className="settingsGroup" style={{ padding: "0.9rem 1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <p className="mutedText" style={{ fontSize: "0.85rem", margin: 0 }}>
        Share your link. When someone joins and gets started, you each earn {rewardCoins} coins.
      </p>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        <input readOnly value={joinUrl} className="textInput" style={{ flex: "1 1 16ch", fontSize: "0.85rem" }} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="button buttonSmall" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mutedText" style={{ fontSize: "0.8rem", margin: 0 }}>
        {rewardedInvites} of {maxRewarded} invites rewarded
      </p>
    </div>
  );
}
