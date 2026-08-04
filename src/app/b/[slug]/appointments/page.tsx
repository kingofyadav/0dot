import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getBusinessMember } from "@/lib/businesses";
import { getAvailableSlots } from "@/lib/appointments";
import { requestAppointment, cancelMyAppointment } from "@/app/actions/appointments";
import { RequestSlotButton } from "@/components/RequestSlotButton";

const STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No-show",
};

const SLOT_WINDOW_DAYS = 14;

// build plan step 8 / spec §10: customer-facing booking — pick a bookable
// Offering, pick a computed-on-read slot, request it. Business-level
// availability only (see AvailabilityRule's schema comment for the MVP
// scope reduction).
export default async function AppointmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ offeringId?: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();
  const { offeringId } = await searchParams;

  const business = await db.business.findUnique({ where: { slug } });
  if (!business) notFound();

  const currentUser = await getCurrentUser();
  const membership = currentUser ? await getBusinessMember(business.id, currentUser.id) : null;
  if (business.status === "pending" && !membership) notFound();

  const bookableOfferings = await db.offering.findMany({
    where: { businessId: business.id, status: "active", isBookable: true },
    orderBy: { name: "asc" },
  });

  const selectedOffering = offeringId ? bookableOfferings.find((o) => o.id === offeringId) : undefined;
  const now = new Date();
  const slots = selectedOffering
    ? await getAvailableSlots(selectedOffering.id, {
        from: now,
        to: new Date(now.getTime() + SLOT_WINDOW_DAYS * 24 * 60 * 60 * 1000),
      })
    : [];

  const myAppointments = currentUser
    ? await db.appointment.findMany({
        where: { businessId: business.id, customerId: currentUser.id },
        orderBy: { startsAt: "desc" },
        include: { offering: { select: { name: true } } },
      })
    : [];

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{business.name} — Appointments</h1>
        <Link href={`/b/${business.slug}`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Back to business page
        </Link>
      </div>

      {bookableOfferings.length === 0 ? (
        <p className="mutedText">Nothing bookable here yet.</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            {bookableOfferings.map((o) => (
              <Link
                key={o.id}
                href={`/b/${business.slug}/appointments?offeringId=${o.id}`}
                className="button buttonSecondary buttonSmall"
                style={o.id === offeringId ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
              >
                {o.name} ({o.durationMinutes}min)
              </Link>
            ))}
          </div>

          {selectedOffering && (
            <div style={{ marginBottom: "1.5rem" }}>
              <p className="sectionHeading">Available times</p>
              {!currentUser ? (
                <p className="mutedText">
                  <Link href="/login">Log in</Link> to request an appointment.
                </p>
              ) : slots.length === 0 ? (
                <p className="mutedText">No open slots in the next {SLOT_WINDOW_DAYS} days.</p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                  {slots.map((slot) => (
                    <RequestSlotButton
                      key={slot.startsAt.toISOString()}
                      offeringId={selectedOffering.id}
                      startsAt={slot.startsAt.toISOString()}
                      label={slot.startsAt.toLocaleString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      formAction={requestAppointment}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {currentUser && myAppointments.length > 0 && (
        <div>
          <p className="sectionHeading">Your appointments</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {myAppointments.map((a) => (
              <div key={a.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.3rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <strong>{a.offering?.name ?? "Appointment"}</strong>
                  <span className="mutedText" style={{ fontSize: "0.8rem" }}>
                    {STATUS_LABEL[a.status] ?? a.status}
                  </span>
                </div>
                <span className="mutedText" style={{ fontSize: "0.85rem" }}>{a.startsAt.toLocaleString()}</span>
                {(a.status === "requested" || a.status === "confirmed") && (
                  <form action={cancelMyAppointment}>
                    <input type="hidden" name="appointmentId" value={a.id} />
                    <button type="submit" className="button buttonDanger buttonSmall">
                      Cancel
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
