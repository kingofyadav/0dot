import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canManageCatalog, isBusinessStaff } from "@/lib/businesses";
import { createAvailabilityRule, deleteAvailabilityRule, confirmAppointment, cancelAppointment } from "@/app/actions/appointments";

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No-show",
};

// canManageCatalog-tier (owner|admin|editor) for viewing/managing
// availability, same tier as the catalog it's scheduling against;
// confirm/cancel on individual appointments is business-staff-tier
// (owner|admin) per build plan step 8, checked separately below and
// enforced again server-side in the actions themselves.
export default async function ManageAppointmentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const business = await db.business.findUnique({ where: { slug } });
  if (!business) notFound();

  if (!(await canManageCatalog(business.id, currentUser.id))) {
    redirect(`/b/${business.slug}`);
  }
  const canConfirmCancel = await isBusinessStaff(business.id, currentUser.id);

  const rules = await db.availabilityRule.findMany({
    where: { businessId: business.id, teamMemberId: null },
    orderBy: [{ dayOfWeek: "asc" }, { startsAtLocal: "asc" }],
  });

  const appointments = await db.appointment.findMany({
    where: { businessId: business.id, status: { in: ["requested", "confirmed"] } },
    orderBy: { startsAt: "asc" },
    include: { offering: { select: { name: true } }, customer: { include: { username: true, profile: true } } },
  });

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Appointments — {business.name}</h1>
        <Link href={`/b/${business.slug}/appointments`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Customer view
        </Link>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <p className="sectionHeading">Availability</p>
        {rules.length === 0 && <p className="mutedText">No availability set — customers won&apos;t see any open slots.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.75rem" }}>
          {rules.map((rule) => (
            <div key={rule.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem" }}>
              <span>
                {DAY_LABEL[rule.dayOfWeek]} {rule.startsAtLocal}–{rule.endsAtLocal} ({rule.timezone})
              </span>
              <form action={deleteAvailabilityRule}>
                <input type="hidden" name="ruleId" value={rule.id} />
                <button type="submit" className="button buttonDanger buttonSmall">
                  Remove
                </button>
              </form>
            </div>
          ))}
        </div>
        <details className="profileEditToggle">
          <summary className="mutedText" style={{ fontSize: "0.85rem", cursor: "pointer" }}>
            Add availability
          </summary>
          <form
            action={createAvailabilityRule}
            style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center", marginTop: "0.5rem" }}
          >
            <input type="hidden" name="businessId" value={business.id} />
            <select name="dayOfWeek" defaultValue="1" className="textInput" style={{ width: "auto" }}>
              {DAY_LABEL.map((label, i) => (
                <option key={label} value={i}>
                  {label}
                </option>
              ))}
            </select>
            <input type="time" name="startsAtLocal" defaultValue="09:00" required className="textInput" style={{ width: "auto" }} />
            <span className="mutedText">to</span>
            <input type="time" name="endsAtLocal" defaultValue="17:00" required className="textInput" style={{ width: "auto" }} />
            <input
              type="text"
              name="timezone"
              placeholder="IANA timezone, e.g. America/New_York"
              defaultValue="UTC"
              required
              className="textInput"
              style={{ width: "16rem" }}
            />
            <button type="submit" className="button buttonSmall">
              Add
            </button>
          </form>
        </details>
      </div>

      <div>
        <p className="sectionHeading">Requests & upcoming</p>
        {appointments.length === 0 && <p className="mutedText">Nothing scheduled.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {appointments.map((a) => {
            const customerName = a.customer.profile?.displayName ?? a.customer.username?.handle ?? "Unknown";
            return (
              <div key={a.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.3rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <strong>
                    {a.offering?.name ?? "Appointment"} — {customerName}
                  </strong>
                  <span className="mutedText" style={{ fontSize: "0.8rem" }}>
                    {STATUS_LABEL[a.status] ?? a.status}
                  </span>
                </div>
                <span className="mutedText" style={{ fontSize: "0.85rem" }}>{a.startsAt.toLocaleString()}</span>
                {a.notes && <p style={{ margin: 0, fontSize: "0.85rem" }}>{a.notes}</p>}
                {canConfirmCancel && (
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    {a.status === "requested" && (
                      <form action={confirmAppointment}>
                        <input type="hidden" name="appointmentId" value={a.id} />
                        <button type="submit" className="button buttonSmall">
                          Confirm
                        </button>
                      </form>
                    )}
                    <form action={cancelAppointment}>
                      <input type="hidden" name="appointmentId" value={a.id} />
                      <button type="submit" className="button buttonDanger buttonSmall">
                        Cancel
                      </button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
