import type { Metadata } from "next";
import Link from "next/link";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { DmcaNoticeForm } from "./DmcaNoticeForm";

export const metadata: Metadata = { title: "DMCA notice" };

// phase-13 spec §4.4: the heavier, statute-shaped formal notice, distinct
// from the lightweight Report(category=ip_infringement) flag every
// ReportButton already offers. Requires a verified account (same posture
// as every write path in this codebase) — see DmcaNoticeForm's comment.
export default async function DmcaPage() {
  await requireVerifiedUser();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div className="profileCard">
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.25rem" }}>File a DMCA takedown notice</h1>
        <p className="mutedText">
          Use this form to request removal of content that infringes your copyright. If you were notified that
          your own content was removed and you believe that was a mistake, you can file a counter-notice from{" "}
          <Link href="/trust-safety">your Trust &amp; Safety page</Link>.
        </p>
      </div>
      <DmcaNoticeForm />
    </div>
  );
}
