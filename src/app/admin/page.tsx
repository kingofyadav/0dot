import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformRole } from "@/lib/auth-guards";

export const metadata: Metadata = { title: "Admin" };

const SECTIONS = [
  { href: "/admin/trust-safety", label: "Trust & Safety", description: "Content/account reports, business claims, appeals, transparency report." },
  { href: "/admin/businesses", label: "Businesses", description: "Pending business listings awaiting approval." },
  { href: "/admin/payments", label: "Payments", description: "IAP (Apple/Google) payout batches." },
  { href: "/admin/wallet", label: "Wallet", description: "Coin top-up and payout requests." },
  { href: "/admin/platform-roles", label: "Platform roles", description: "Grant/revoke staff access to this admin area (super_admin only)." },
];

// No other page in the app links into /admin/* — this is the one in-app
// entry point, so staff don't have to know every admin URL by heart. Every
// section still enforces its own requirePlatformRole bar independently;
// this index only needs the lowest floor (support) since it's just links out.
export default async function AdminIndexPage() {
  await requirePlatformRole("support");

  return (
    <div className="profileCard">
      <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.25rem" }}>Admin</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {SECTIONS.map((section) => (
          <Link key={section.href} href={section.href} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.15rem" }}>
            <strong>{section.label}</strong>
            <span className="mutedText" style={{ fontSize: "0.85rem" }}>{section.description}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
