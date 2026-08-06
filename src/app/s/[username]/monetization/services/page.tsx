import Link from "next/link";
import { redirect } from "next/navigation";
import { Briefcase, CalendarClock, Clock, Pencil, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { OfferingForm } from "@/components/OfferingForm";
import { archiveOffering } from "@/app/actions/offerings";
import { createAvailabilityRule, deleteAvailabilityRule, confirmAppointment, cancelAppointment } from "@/app/actions/appointments";
import { SettingsRow } from "@/components/SettingsRow";
import { EmptyState } from "@/components/EmptyState";

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

      <p className="settingsGroupLabel">Your offerings</p>
      {offerings.length === 0 && <EmptyState message="Nothing listed yet." />}
      {offerings.map((offering) => (
        <div key={offering.id} className="settingsGroup" style={{ marginBottom: "var(--space-3)" }}>
          <SettingsRow
            icon={Briefcase}
            label={offering.name}
            description={`${offering.kind === "product" ? "Product" : "Service"} · ${STATUS_LABEL[offering.status] ?? offering.status}${offering.price !== null ? ` · ${offering.currency} ${offering.price.toFixed(2)}` : " · contact for pricing"}`}
            trailing={
              offering.status !== "archived" ? (
                <form action={archiveOffering}>
                  <input type="hidden" name="offeringId" value={offering.id} />
                  <button type="submit" className="button buttonSecondary buttonSmall">Archive</button>
                </form>
              ) : undefined
            }
          />
          <details>
            <summary className="settingsRow settingsAddTrigger">
              <span className="settingsRowIcon" aria-hidden="true">
                <Pencil size={16} />
              </span>
              <span className="settingsRowText">
                <span className="settingsRowLabel">Edit</span>
              </span>
            </summary>
            <div className="settingsAddPanelBody">
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
      <details className="settingsGroup" style={{ marginBottom: "var(--space-6)" }}>
        <summary className="settingsRow settingsAddTrigger">
          <span className="settingsRowIcon" aria-hidden="true">
            <Plus size={18} />
          </span>
          <span className="settingsRowText">
            <span className="settingsRowLabel">Add an offering</span>
          </span>
        </summary>
        <div className="settingsAddPanelBody">
          <OfferingForm owner={{ type: "self" }} />
        </div>
      </details>

      <p className="settingsGroupLabel">Availability</p>
      {rules.length === 0 ? (
        <EmptyState message="No availability set — customers won't see any open slots for bookable services." />
      ) : (
        <div className="settingsGroup">
          {rules.map((rule) => (
            <SettingsRow
              key={rule.id}
              icon={Clock}
              label={`${DAY_LABEL[rule.dayOfWeek]} ${rule.startsAtLocal}–${rule.endsAtLocal}`}
              description={rule.timezone}
              trailing={
                <form action={deleteAvailabilityRule}>
                  <input type="hidden" name="ruleId" value={rule.id} />
                  <button type="submit" className="button buttonDanger buttonSmall">Remove</button>
                </form>
              }
            />
          ))}
        </div>
      )}
      <details className="settingsGroup" style={{ marginBottom: "var(--space-6)" }}>
        <summary className="settingsRow settingsAddTrigger">
          <span className="settingsRowIcon" aria-hidden="true">
            <Plus size={18} />
          </span>
          <span className="settingsRowText">
            <span className="settingsRowLabel">Add availability</span>
          </span>
        </summary>
        <form
          action={createAvailabilityRule}
          className="settingsAddPanelBody"
          style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}
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

      <p className="settingsGroupLabel">Requests &amp; upcoming</p>
      {appointments.length === 0 ? (
        <EmptyState message="Nothing scheduled." />
      ) : (
        <div className="settingsGroup">
          {appointments.map((a) => {
            const customerName = a.customer.profile?.displayName ?? a.customer.username?.handle ?? "Unknown";
            return (
              <SettingsRow
                key={a.id}
                icon={CalendarClock}
                label={`${a.offering?.name ?? "Appointment"} — ${customerName}`}
                description={`${APPOINTMENT_STATUS_LABEL[a.status] ?? a.status} · ${a.startsAt.toLocaleString()}${a.notes ? ` · ${a.notes}` : ""}`}
                trailing={
                  <>
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
                  </>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
