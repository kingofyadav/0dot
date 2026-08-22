import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformRole } from "@/lib/auth-guards";

// phase-12 spec §9: "mostly a reporting/export job over existing data, not
// a new core entity" — a straight aggregation over TrustSafetyCase/Appeal,
// no new tables. Gated behind staff for now rather than published publicly
// — exact publication cadence and how much detail is safe to expose
// without revealing exploitable detection thresholds is an explicit open
// question for product/legal (§10), not resolved by this build.
export default async function TrustSafetyTransparencyPage() {
  await requirePlatformRole("support");

  const [byCaseType, byStatus, totalAppeals, overturnedAppeals] = await Promise.all([
    db.trustSafetyCase.groupBy({ by: ["caseType"], _count: { _all: true } }),
    db.trustSafetyCase.groupBy({ by: ["status"], _count: { _all: true } }),
    db.appeal.count({ where: { status: { not: "pending" } } }),
    db.appeal.count({ where: { status: "overturned" } }),
  ]);

  // §9's explicit call-out: the appeal overturn rate is the one number
  // that speaks to whether enforcement itself is trustworthy, not just how
  // active it is — surfaced first, not buried under raw volume.
  const overturnRate = totalAppeals > 0 ? ((overturnedAppeals / totalAppeals) * 100).toFixed(1) : null;

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.25rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Transparency report</h1>
        <Link href="/admin/trust-safety" className="mutedText" style={{ fontSize: "0.85rem" }}>
          ← Case queue
        </Link>
      </div>
      <p className="mutedText" style={{ marginBottom: "1.25rem" }}>
        Aggregated over all-time case/appeal data (spec §9). A real publication cadence and public-facing
        granularity are unresolved product/legal questions, not decided by this page.
      </p>

      <h2 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "0.4rem" }}>Appeal overturn rate</h2>
      <p style={{ marginBottom: "1.25rem" }}>
        {overturnRate !== null ? `${overturnRate}% (${overturnedAppeals} of ${totalAppeals} decided appeals)` : "No decided appeals yet."}
      </p>

      <h2 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "0.4rem" }}>Case volume by type</h2>
      <table style={{ width: "100%", marginBottom: "1.25rem", borderCollapse: "collapse" }}>
        <tbody>
          {byCaseType.map((row) => (
            <tr key={row.caseType}>
              <td className="mutedText" style={{ padding: "0.25rem 0" }}>{row.caseType}</td>
              <td style={{ textAlign: "right" }}>{row._count._all}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "0.4rem" }}>Resolution breakdown</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {byStatus.map((row) => (
            <tr key={row.status}>
              <td className="mutedText" style={{ padding: "0.25rem 0" }}>{row.status}</td>
              <td style={{ textAlign: "right" }}>{row._count._all}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
