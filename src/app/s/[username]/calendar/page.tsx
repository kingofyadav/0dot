import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarClock, CalendarDays, User } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getCalendarItems } from "@/lib/calendar";
import { deleteCalendarEntry } from "@/app/actions/calendar";
import { ConfirmButton } from "@/components/ConfirmButton";
import { EmptyState } from "@/components/EmptyState";
import { SettingsRow } from "@/components/SettingsRow";
import { CalendarEntryForm } from "./CalendarEntryForm";

export const metadata: Metadata = { title: "Calendar" };

const KIND_LABEL: Record<string, string> = { appointment: "Appointment", event: "Event", personal: "Personal" };
const KIND_ICON: Record<string, typeof CalendarClock> = { appointment: CalendarClock, event: CalendarDays, personal: User };

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

      {items.length === 0 ? (
        <EmptyState message="Nothing on your calendar yet." />
      ) : (
        <div className="settingsGroup" style={{ marginTop: "1.5rem" }}>
          {items.map((item) => (
            <SettingsRow
              key={item.id}
              href={item.href ?? undefined}
              icon={KIND_ICON[item.kind]}
              label={item.title}
              description={`${KIND_LABEL[item.kind]} · ${item.startsAt.toLocaleString()}${item.endsAt ? ` – ${item.endsAt.toLocaleString()}` : ""}`}
              trailing={
                item.kind === "personal" ? (
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
                ) : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
