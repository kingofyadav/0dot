import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Monitor } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser, getCurrentSessionToken, hashToken } from "@/lib/session";
import { revokeSession, revokeAllOtherSessionsAction } from "@/app/actions/session-management";
import { SettingsRow } from "@/components/SettingsRow";
import { EmptyState } from "@/components/EmptyState";

export const metadata: Metadata = { title: "Active sessions" };

// addendum §4/§10: lists every active Session row for the caller, newest
// activity first, plus the last ~20 LoginEvent rows (§10) below it — kept on
// one page rather than a separate security/history route, small enough not
// to need the split the spec floats as an alternative.
export default async function ActiveSessionsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const currentToken = await getCurrentSessionToken();
  const currentTokenHash = currentToken ? hashToken(currentToken) : null;

  const [sessions, loginEvents] = await Promise.all([
    db.session.findMany({ where: { userId: currentUser.id }, orderBy: { lastSeenAt: "desc" } }),
    db.loginEvent.findMany({ where: { userId: currentUser.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Active sessions</h2>
      <p className="mutedText" style={{ marginBottom: "1rem" }}>
        Devices currently signed in to your account. Revoke any you don&apos;t recognize.
      </p>

      <div className="settingsGroup">
        {sessions.map((session) => {
          const isCurrent = session.tokenHash === currentTokenHash;
          return (
            <SettingsRow
              key={session.id}
              icon={Monitor}
              label={isCurrent ? "This device" : session.userAgent || "Unknown device"}
              description={`${session.ipAddress ?? "Unknown location"} · Last active ${session.lastSeenAt.toLocaleString()}`}
              trailing={
                isCurrent ? undefined : (
                  <form action={revokeSession}>
                    <input type="hidden" name="sessionId" value={session.id} />
                    <button type="submit" className="button buttonDanger buttonSmall">
                      Revoke
                    </button>
                  </form>
                )
              }
            />
          );
        })}
      </div>

      {sessions.length > 1 && (
        <form action={revokeAllOtherSessionsAction} style={{ marginTop: "1rem" }}>
          <button type="submit" className="button buttonSecondary buttonSmall">
            Sign out all other devices
          </button>
        </form>
      )}

      <h2 className="settingsSectionHeading" style={{ marginTop: "2rem" }}>
        Recent login activity
      </h2>
      {loginEvents.length === 0 ? (
        <EmptyState message="No login history yet." />
      ) : (
        <div className="settingsGroup">
          {loginEvents.map((event) => (
            <SettingsRow
              key={event.id}
              label={`${event.success ? "Successful" : "Failed"} sign-in · ${event.method}`}
              description={`${event.ipAddress ?? "Unknown location"} · ${event.createdAt.toLocaleString()}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
