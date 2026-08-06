import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getCalendarItems } from "@/lib/calendar";
import { deleteCalendarEntry } from "@/app/actions/calendar";
import { ConfirmButton } from "@/components/ConfirmButton";
import { EmptyState } from "@/components/EmptyState";
import { CalendarEntryForm } from "./CalendarEntryForm";

const KIND_LABEL: Record<string, string> = { appointment: "Appointment", event: "Event", personal: "Personal" };

export default async function CalendarSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const profile = await db.profile.findUnique({ where: { userId: currentUser.id } });
  if (!profile) redirect("/claim-username");

  const items = await getCalendarItems(profile.id, currentUser.id);

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Calendar</h2>
      <p className="mutedText" style={{ fontSize: "0.9rem" }}>
        Your booked appointments, RSVP&rsquo;d/ticketed events, and personal entries, all in one view.
      </p>

      <div style={{ marginTop: "1rem" }}>
        <CalendarEntryForm />
      </div>

      <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {items.length === 0 && <EmptyState message="Nothing on your calendar yet." />}
        {items.map((item) => (
          <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.6rem 0.8rem" }}>
            <div>
              <span className="mutedText" style={{ fontSize: "0.75rem" }}>{KIND_LABEL[item.kind]}</span>
              <p style={{ margin: 0 }}>
                {item.href ? <Link href={item.href}>{item.title}</Link> : item.title}
              </p>
              <p className="mutedText" style={{ margin: 0, fontSize: "0.8rem" }}>
                {item.startsAt.toLocaleString()}
                {item.endsAt && ` – ${item.endsAt.toLocaleString()}`}
              </p>
            </div>
            {item.kind === "personal" && (
              <form action={deleteCalendarEntry}>
                <input type="hidden" name="entryId" value={item.id.replace("entry:", "")} />
                <ConfirmButton
                  className="button buttonSecondary iconButton"
                  aria-label="Delete calendar entry"
                  title="Delete this entry?"
                  description="This removes it from your calendar."
                  confirmLabel="Delete"
                >
                  ×
                </ConfirmButton>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
