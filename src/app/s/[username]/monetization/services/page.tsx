import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { OfferingForm } from "@/components/OfferingForm";
import { archiveOffering } from "@/app/actions/offerings";
import { createAvailabilityRule, deleteAvailabilityRule, confirmAppointment, cancelAppointment } from "@/app/actions/appointments";

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS_LABEL: Record<string, string> = { draft: "Draft", active: "Active", archived: "Archived" };
const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No-show",
};

// phase-9 spec §3.2: an individual freelancer's own catalog/availability/
// bookings management — the "self" mirror of /b/[slug]/catalog +
// /b/[slug]/appointments/manage, reusing the same OfferingForm/
// createAvailabilityRule/confirmAppointment actions with ownerType "self"
// (offerings.ts's resolveOfferingOwner) rather than a parallel set of
// individual-only actions.
export default async function FreelanceServicesSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const username = await db.username.findUnique({ where: { userId: currentUser.id }, select: { handle: true } });

  const [offerings, rules, appointments] = await Promise.all([
    db.offering.findMany({ where: { sellerUserId: currentUser.id }, orderBy: { createdAt: "desc" } }),
    db.availabilityRule.findMany({
      where: { sellerUserId: currentUser.id, teamMemberId: null },
      orderBy: [{ dayOfWeek: "asc" }, { startsAtLocal: "asc" }],
    }),
    db.appointment.findMany({
      where: { sellerUserId: currentUser.id, status: { in: ["requested", "confirmed"] } },
      orderBy: { startsAt: "asc" },
      include: { offering: { select: { name: true } }, customer: { include: { username: true, profile: true } } },
    }),
  ]);

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Freelance services</h2>
      <p className="mutedText" style={{ marginBottom: "1rem" }}>
        List a bookable service or a sellable product as an individual — no business required. Needs an active{" "}
        <Link href={`/s/${username?.handle}/monetization/payouts`}>payout account</Link> to accept paid bookings.
      </p>

      <div style={{ marginBottom: "1.5rem" }}>
        <p className="sectionHeading">Your offerings</p>
        {offerings.length === 0 && <p className="mutedText">Nothing listed yet.</p>}
        {offerings.map((offering) => (
          <div key={offering.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem", marginBottom: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>
                <strong>{offering.name}</strong>{" "}
                <span className="mutedText" style={{ fontSize: "0.8rem" }}>
                  {offering.kind === "product" ? "Product" : "Service"} · {STATUS_LABEL[offering.status] ?? offering.status}
                  {offering.price !== null ? ` · ${offering.currency} ${offering.price.toFixed(2)}` : " · contact for pricing"}
                </span>
              </span>
              {offering.status !== "archived" && (
                <form action={archiveOffering}>
                  <input type="hidden" name="offeringId" value={offering.id} />
                  <button type="submit" className="button buttonSecondary buttonSmall">Archive</button>
                </form>
              )}
            </div>
            <details className="profileEditToggle">
              <summary className="mutedText" style={{ fontSize: "0.85rem" }}>Edit</summary>
              <div style={{ marginTop: "0.5rem" }}>
                <OfferingForm
                  owner={{ type: "self" }}
                  offering={{
                    id: offering.id,
                    kind: offering.kind,
                    name: offering.name,
                    description: offering.description,
                    price: offering.price,
                    currency: offering.currency,
                    paymentLinkUrl: offering.paymentLinkUrl,
                    status: offering.status,
                    sku: offering.sku,
                    stockStatus: offering.stockStatus,
                    isBookable: offering.isBookable,
                    durationMinutes: offering.durationMinutes,
                  }}
                />
              </div>
            </details>
          </div>
        ))}
        <details className="profileEditToggle" style={{ marginTop: "0.5rem" }}>
          <summary>Add an offering</summary>
          <div style={{ marginTop: "0.5rem" }}>
            <OfferingForm owner={{ type: "self" }} />
          </div>
        </details>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <p className="sectionHeading">Availability</p>
        {rules.length === 0 && <p className="mutedText">No availability set — customers won&apos;t see any open slots for bookable services.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.75rem" }}>
          {rules.map((rule) => (
            <div key={rule.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem" }}>
              <span>
                {DAY_LABEL[rule.dayOfWeek]} {rule.startsAtLocal}–{rule.endsAtLocal} ({rule.timezone})
              </span>
              <form action={deleteAvailabilityRule}>
                <input type="hidden" name="ruleId" value={rule.id} />
                <button type="submit" className="button buttonDanger buttonSmall">Remove</button>
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
            <input type="hidden" name="ownerType" value="self" />
            <select name="dayOfWeek" defaultValue="1" className="textInput" style={{ width: "auto" }}>
              {DAY_LABEL.map((label, i) => (
                <option key={label} value={i}>{label}</option>
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
            <button type="submit" className="button buttonSmall">Add</button>
          </form>
        </details>
      </div>

      <div>
        <p className="sectionHeading">Requests &amp; upcoming</p>
        {appointments.length === 0 && <p className="mutedText">Nothing scheduled.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {appointments.map((a) => {
            const customerName = a.customer.profile?.displayName ?? a.customer.username?.handle ?? "Unknown";
            return (
              <div key={a.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.3rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <strong>{a.offering?.name ?? "Appointment"} — {customerName}</strong>
                  <span className="mutedText" style={{ fontSize: "0.8rem" }}>
                    {APPOINTMENT_STATUS_LABEL[a.status] ?? a.status}
                  </span>
                </div>
                <span className="mutedText" style={{ fontSize: "0.85rem" }}>{a.startsAt.toLocaleString()}</span>
                {a.notes && <p style={{ margin: 0, fontSize: "0.85rem" }}>{a.notes}</p>}
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  {a.status === "requested" && (
                    <form action={confirmAppointment}>
                      <input type="hidden" name="appointmentId" value={a.id} />
                      <button type="submit" className="button buttonSmall">Confirm</button>
                    </form>
                  )}
                  <form action={cancelAppointment}>
                    <input type="hidden" name="appointmentId" value={a.id} />
                    <button type="submit" className="button buttonDanger buttonSmall">Cancel</button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
