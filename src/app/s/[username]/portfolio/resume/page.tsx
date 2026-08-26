import Link from "next/link";
import { redirect } from "next/navigation";
import { Briefcase, ChevronUp, ChevronDown, GraduationCap, Pencil, Plus, X } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteWorkExperience, moveWorkExperience, deleteEducation, moveEducation } from "@/app/actions/resume";
import { SettingsRow } from "@/components/SettingsRow";
import { ConfirmButton } from "@/components/ConfirmButton";
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

      <p className="settingsGroupLabel">Resume PDF (optional)</p>
      <div className="settingsGroup">
        <div className="settingsAddPanelBody">
          <ResumePdfForm resumePdfUrl={profileRow.resumePdfUrl} />
        </div>
      </div>

      <p className="settingsGroupLabel">Work experience</p>
      {myWorkExperiences.map((item, index) => (
        <div key={item.id} className="settingsGroup" style={{ marginBottom: "var(--space-3)" }}>
          <SettingsRow
            icon={Briefcase}
            label={`${item.title} — ${item.company}`}
            trailing={
              <>
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
                  <ConfirmButton
                    className="button buttonSecondary iconButton"
                    title="Delete this work experience entry?"
                    description="This can't be undone."
                    confirmLabel="Delete"
                    aria-label="Delete"
                  >
                    <X size={16} aria-hidden="true" />
                  </ConfirmButton>
                </form>
              </>
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
              <WorkExperienceForm item={item} />
            </div>
          </details>
        </div>
      ))}
      <details className="settingsGroup">
        <summary className="settingsRow settingsAddTrigger">
          <span className="settingsRowIcon" aria-hidden="true">
            <Plus size={18} />
          </span>
          <span className="settingsRowText">
            <span className="settingsRowLabel">Add work experience</span>
          </span>
        </summary>
        <div className="settingsAddPanelBody">
          <WorkExperienceForm />
        </div>
      </details>

      <p className="settingsGroupLabel">Education</p>
      {myEducation.map((item, index) => (
        <div key={item.id} className="settingsGroup" style={{ marginBottom: "var(--space-3)" }}>
          <SettingsRow
            icon={GraduationCap}
            label={`${item.institution}${item.degree ? ` — ${item.degree}` : ""}`}
            trailing={
              <>
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
                  <ConfirmButton
                    className="button buttonSecondary iconButton"
                    title="Delete this education entry?"
                    description="This can't be undone."
                    confirmLabel="Delete"
                    aria-label="Delete"
                  >
                    <X size={16} aria-hidden="true" />
                  </ConfirmButton>
                </form>
              </>
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
              <EducationForm item={item} />
            </div>
          </details>
        </div>
      ))}
      <details className="settingsGroup">
        <summary className="settingsRow settingsAddTrigger">
          <span className="settingsRowIcon" aria-hidden="true">
            <Plus size={18} />
          </span>
          <span className="settingsRowText">
            <span className="settingsRowLabel">Add education</span>
          </span>
        </summary>
        <div className="settingsAddPanelBody">
          <EducationForm />
        </div>
      </details>
    </div>
  );
}
