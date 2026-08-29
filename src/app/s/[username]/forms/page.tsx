import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClipboardList, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { EmptyState } from "@/components/EmptyState";
import { SettingsRow } from "@/components/SettingsRow";
import { FormBuilder } from "./FormBuilder";

export const metadata: Metadata = { title: "Forms & surveys" };

const STATUS_LABEL: Record<string, string> = { draft: "Draft", published: "Published", closed: "Closed" };

export default async function FormsSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const profile = await db.profile.findUnique({ where: { userId: currentUser.id } });
  if (!profile) redirect("/claim-username");

  const forms = await db.form.findMany({
    where: { ownerProfileId: profile.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { responses: true } } },
  });

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Forms & surveys</h2>

      <details className="settingsGroup" style={{ marginBottom: "1.5rem" }}>
        <summary className="settingsRow settingsAddTrigger">
          <span className="settingsRowIcon" aria-hidden="true">
            <Plus size={18} />
          </span>
          <span className="settingsRowText">
            <span className="settingsRowLabel">Create a form or survey</span>
          </span>
        </summary>
        <div className="settingsAddPanelBody">
          <FormBuilder />
        </div>
      </details>

      {forms.length === 0 ? (
        <EmptyState message="No forms yet." />
      ) : (
        <div className="settingsGroup">
          {forms.map((form) => (
            <SettingsRow
              key={form.id}
              href={`/s/${currentUser.username!.handle}/forms/${form.id}`}
              icon={ClipboardList}
              label={form.title}
              description={`${STATUS_LABEL[form.status]} · ${form._count.responses} responses`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
