import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { publishForm, closeForm, type FormFieldDef } from "@/app/actions/forms";
import { EmptyState } from "@/components/EmptyState";

// Best-effort only, same posture as the courses/developer generateMetadata
// siblings — real access control stays in the page component below, this
// just falls back to a generic title on any lookup/ownership miss.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ formId: string }>;
}): Promise<Metadata> {
  const { formId } = await params;
  const currentUser = await getCurrentUser();
  const form = currentUser
    ? await db.form.findUnique({ where: { id: formId }, select: { title: true, ownerProfileId: true } })
    : null;
  return { title: form && form.ownerProfileId === currentUser?.profile?.id ? form.title : "Form" };
}

export default async function FormDetailPage({ params }: { params: Promise<{ username: string; formId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const { formId } = await params;
  const form = await db.form.findUnique({
    where: { id: formId },
    include: { responses: { orderBy: { submittedAt: "desc" }, take: 100 } },
  });
  if (!form || form.ownerProfileId !== currentUser.profile?.id) notFound();

  const fields = JSON.parse(form.fieldsJson) as FormFieldDef[];

  return (
    <div className="settingsSection">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="settingsSectionHeading">{form.title}</h2>
        <span className="mutedText" style={{ fontSize: "0.85rem" }}>{form.status}</span>
      </div>

      {form.status === "draft" && (
        <form action={publishForm} style={{ marginTop: "0.5rem" }}>
          <input type="hidden" name="formId" value={form.id} />
          <button type="submit" className="button buttonSmall">Publish</button>
        </form>
      )}
      {form.status === "published" && (
        <>
          <p style={{ marginTop: "0.5rem" }}>
            Share link: <Link href={`/form/${form.id}`}>/form/{form.id}</Link>
          </p>
          <form action={closeForm} style={{ marginTop: "0.5rem" }}>
            <input type="hidden" name="formId" value={form.id} />
            <button type="submit" className="button buttonSecondary buttonSmall">Close</button>
          </form>
        </>
      )}

      <div style={{ marginTop: "1.5rem" }}>
        <p className="sectionHeading">Responses ({form.responses.length})</p>
        {form.responses.length === 0 && <EmptyState message="No responses yet." />}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {form.responses.map((response) => {
            const answers = JSON.parse(response.answersJson) as Record<string, string>;
            return (
              <div key={response.id} style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "0.6rem 0.8rem" }}>
                <p className="mutedText" style={{ margin: 0, fontSize: "0.8rem" }}>{response.submittedAt.toLocaleString()}</p>
                {fields.map((field) => (
                  <p key={field.label} style={{ margin: "0.2rem 0 0" }}>
                    <strong>{field.label}:</strong> {answers[field.label] || "—"}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
