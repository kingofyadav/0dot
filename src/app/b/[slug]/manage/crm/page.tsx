import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isBusinessStaff } from "@/lib/businesses";
import { ContactStageSelect } from "./ContactStageSelect";
import { NewContactForm } from "./NewContactForm";
import { EmptyState } from "@/components/EmptyState";

const ACTIVITY_LABEL: Record<string, string> = {
  contact_message: "Sent a message",
  appointment: "Booked an appointment",
  purchase: "Made a purchase",
  manual_note: "Note added",
};

// phase-16 spec §13: deliberately narrow MVP — fixed lead/customer/churned
// pipeline, not business-configurable (§13.1's scope warning). Activity
// rows shown here are mostly auto-derived from ContactMessage/Appointment/
// OfferingPurchase (src/lib/crm.ts), not manually re-entered.
export default async function CrmPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const business = await db.business.findUnique({ where: { slug } });
  if (!business) notFound();
  if (!(await isBusinessStaff(business.id, currentUser.id))) redirect(`/b/${business.slug}`);

  const contacts = await db.contact.findMany({
    where: { businessId: business.id },
    include: {
      user: { select: { profile: true, username: true } },
      activities: { orderBy: { occurredAt: "desc" }, take: 5 },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{business.name} — CRM</h1>
        <Link href={`/b/${business.slug}/manage`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Back to manage
        </Link>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <NewContactForm businessId={business.id} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {contacts.length === 0 && <EmptyState message="No contacts yet." />}
        {contacts.map((contact) => (
          <div key={contact.id} style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "0.75rem 1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>
                  {contact.user?.username
                    ? <Link href={`/${contact.user.username.handle}`}>{contact.user.profile?.displayName ?? contact.user.username.handle}</Link>
                    : contact.externalName || contact.externalEmail || "Unknown contact"}
                </strong>
                {contact.externalEmail && <span className="mutedText"> · {contact.externalEmail}</span>}
              </div>
              <ContactStageSelect contactId={contact.id} stage={contact.stage} />
            </div>
            {contact.notes && <p className="mutedText" style={{ fontSize: "0.85rem", marginTop: "0.3rem" }}>{contact.notes}</p>}
            {contact.activities.length > 0 && (
              <div style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}>
                {contact.activities.map((activity) => (
                  <p key={activity.id} className="mutedText" style={{ margin: 0 }}>
                    {ACTIVITY_LABEL[activity.activityType] ?? activity.activityType} — {activity.occurredAt.toLocaleDateString()}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
