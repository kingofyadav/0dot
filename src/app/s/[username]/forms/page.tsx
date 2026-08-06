import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { EmptyState } from "@/components/EmptyState";
import { FormBuilder } from "./FormBuilder";

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

      <details className="profileEditToggle" style={{ marginBottom: "1.5rem" }}>
        <summary className="sectionHeading" style={{ cursor: "pointer" }}>Create a form or survey</summary>
        <div style={{ marginTop: "0.6rem" }}>
          <FormBuilder />
        </div>
      </details>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {forms.length === 0 && <EmptyState message="No forms yet." />}
        {forms.map((form) => (
          <Link
            key={form.id}
            href={`/s/${currentUser.username!.handle}/forms/${form.id}`}
            style={{ display: "flex", justifyContent: "space-between", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.6rem 0.8rem" }}
          >
            <span>{form.title}</span>
            <span className="mutedText" style={{ fontSize: "0.85rem" }}>
              {STATUS_LABEL[form.status]} · {form._count.responses} responses
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
