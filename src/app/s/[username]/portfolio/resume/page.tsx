import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteWorkExperience, moveWorkExperience, deleteEducation, moveEducation } from "@/app/actions/resume";
import { WorkExperienceForm } from "../../WorkExperienceForm";
import { EducationForm } from "../../EducationForm";
import { ResumePdfForm } from "../../ResumePdfForm";

export default async function ResumeSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!currentUser.username) redirect("/claim-username");

  const profileRow = await db.profile.findUnique({ where: { userId: currentUser.id } });
  if (!profileRow) redirect("/claim-username");

  const [myWorkExperiences, myEducation] = await Promise.all([
    db.workExperience.findMany({ where: { profileId: profileRow.id }, orderBy: { position: "asc" } }),
    db.education.findMany({ where: { profileId: profileRow.id }, orderBy: { position: "asc" } }),
  ]);

  const handle = currentUser.username.handle;

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Resume</h2>
      <p className="mutedText" style={{ fontSize: "0.85rem" }}>
        <Link href={`/${handle}/resume`}>View generated resume</Link> — assembled from Work experience,
        Education, Skills, and projects marked &ldquo;Feature on resume&rdquo; elsewhere in Portfolio.
      </p>

      <p className="mutedText" style={{ fontSize: "0.85rem", marginTop: "0.6rem" }}>Resume PDF (optional)</p>
      <ResumePdfForm resumePdfUrl={profileRow.resumePdfUrl} />

      <p className="mutedText" style={{ fontSize: "0.85rem", marginTop: "0.9rem" }}>Work experience</p>
      {myWorkExperiences.map((item, index) => (
        <div key={item.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem", marginBottom: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>{item.title} — {item.company}</strong>
            <span style={{ display: "flex", gap: "0.25rem" }}>
              <form action={moveWorkExperience}>
                <input type="hidden" name="workExperienceId" value={item.id} />
                <input type="hidden" name="direction" value="up" />
                <button type="submit" className="button buttonSecondary iconButton" disabled={index === 0} aria-label="Move up"><ChevronUp size={16} aria-hidden="true" /></button>
              </form>
              <form action={moveWorkExperience}>
                <input type="hidden" name="workExperienceId" value={item.id} />
                <input type="hidden" name="direction" value="down" />
                <button type="submit" className="button buttonSecondary iconButton" disabled={index === myWorkExperiences.length - 1} aria-label="Move down"><ChevronDown size={16} aria-hidden="true" /></button>
              </form>
              <form action={deleteWorkExperience}>
                <input type="hidden" name="workExperienceId" value={item.id} />
                <button type="submit" className="button buttonSecondary iconButton" aria-label="Delete"><X size={16} aria-hidden="true" /></button>
              </form>
            </span>
          </div>
          <details className="profileEditToggle">
            <summary className="mutedText" style={{ fontSize: "0.85rem" }}>Edit</summary>
            <div style={{ marginTop: "0.5rem" }}>
              <WorkExperienceForm item={item} />
            </div>
          </details>
        </div>
      ))}
      <details className="profileEditToggle" style={{ marginTop: "0.5rem" }}>
        <summary>Add work experience</summary>
        <div style={{ marginTop: "0.5rem" }}>
          <WorkExperienceForm />
        </div>
      </details>

      <p className="mutedText" style={{ fontSize: "0.85rem", marginTop: "0.9rem" }}>Education</p>
      {myEducation.map((item, index) => (
        <div key={item.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem", marginBottom: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>{item.institution}{item.degree ? ` — ${item.degree}` : ""}</strong>
            <span style={{ display: "flex", gap: "0.25rem" }}>
              <form action={moveEducation}>
                <input type="hidden" name="educationId" value={item.id} />
                <input type="hidden" name="direction" value="up" />
                <button type="submit" className="button buttonSecondary iconButton" disabled={index === 0} aria-label="Move up"><ChevronUp size={16} aria-hidden="true" /></button>
              </form>
              <form action={moveEducation}>
                <input type="hidden" name="educationId" value={item.id} />
                <input type="hidden" name="direction" value="down" />
                <button type="submit" className="button buttonSecondary iconButton" disabled={index === myEducation.length - 1} aria-label="Move down"><ChevronDown size={16} aria-hidden="true" /></button>
              </form>
              <form action={deleteEducation}>
                <input type="hidden" name="educationId" value={item.id} />
                <button type="submit" className="button buttonSecondary iconButton" aria-label="Delete"><X size={16} aria-hidden="true" /></button>
              </form>
            </span>
          </div>
          <details className="profileEditToggle">
            <summary className="mutedText" style={{ fontSize: "0.85rem" }}>Edit</summary>
            <div style={{ marginTop: "0.5rem" }}>
              <EducationForm item={item} />
            </div>
          </details>
        </div>
      ))}
      <details className="profileEditToggle" style={{ marginTop: "0.5rem" }}>
        <summary>Add education</summary>
        <div style={{ marginTop: "0.5rem" }}>
          <EducationForm />
        </div>
      </details>
    </div>
  );
}
