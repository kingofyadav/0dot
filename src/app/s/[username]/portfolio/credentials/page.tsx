import { redirect } from "next/navigation";
import { Award as AwardIcon, FileText, Plus, ShieldCheck, X } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteResearchPaper, deleteCertificate, deleteAward } from "@/app/actions/credentials";
import { SettingsRow } from "@/components/SettingsRow";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ResearchPaperForm, CertificateForm, AwardForm } from "../../CredentialForms";

// spec §7.4/§7.5: three independent, structurally-identical self-attested
// entities — combined on one settings page the same way their action file
// (credentials.ts) already combines them, rather than three near-empty
// pages.
export default async function CredentialsSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const [myResearchPapers, myCertificates, myAwards, myProjects] = await Promise.all([
    db.researchPaper.findMany({ where: { profile: { userId: currentUser.id } }, orderBy: { publishDate: "desc" } }),
    db.certificate.findMany({ where: { profile: { userId: currentUser.id } }, orderBy: { issueDate: "desc" } }),
    db.award.findMany({ where: { profile: { userId: currentUser.id } }, orderBy: { awardedDate: "desc" } }),
    db.project.findMany({ where: { ownerId: currentUser.id }, select: { id: true, title: true } }),
  ]);

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Credentials</h2>

      <p className="settingsGroupLabel">Research papers</p>
      {myResearchPapers.length === 0 ? (
        <EmptyState message="No papers yet." />
      ) : (
        <div className="settingsGroup">
          {myResearchPapers.map((paper) => (
            <SettingsRow
              key={paper.id}
              icon={FileText}
              label={paper.title}
              description={paper.authors}
              trailing={
                <form action={deleteResearchPaper}>
                  <input type="hidden" name="researchPaperId" value={paper.id} />
                  <ConfirmButton
                    className="button buttonSecondary iconButton"
                    title="Delete this paper?"
                    description="This can't be undone."
                    confirmLabel="Delete"
                    aria-label="Delete paper"
                  >
                    <X size={16} aria-hidden="true" />
                  </ConfirmButton>
                </form>
              }
            />
          ))}
        </div>
      )}
      <details className="settingsGroup">
        <summary className="settingsRow settingsAddTrigger">
          <span className="settingsRowIcon" aria-hidden="true">
            <Plus size={18} />
          </span>
          <span className="settingsRowText">
            <span className="settingsRowLabel">Add a paper</span>
          </span>
        </summary>
        <div className="settingsAddPanelBody">
          <ResearchPaperForm ownProjects={myProjects.map((p) => ({ id: p.id, title: p.title }))} />
        </div>
      </details>

      <p className="settingsGroupLabel">Certificates</p>
      <p className="mutedText" style={{ fontSize: "0.8rem", marginBottom: "var(--space-2)" }}>Self-reported — not verified by 0dot. Add a verification link so viewers can check independently.</p>
      {myCertificates.length === 0 ? (
        <EmptyState message="No certificates yet." />
      ) : (
        <div className="settingsGroup">
          {myCertificates.map((cert) => (
            <SettingsRow
              key={cert.id}
              icon={ShieldCheck}
              label={cert.title}
              description={cert.issuingOrg}
              trailing={
                <form action={deleteCertificate}>
                  <input type="hidden" name="certificateId" value={cert.id} />
                  <ConfirmButton
                    className="button buttonSecondary iconButton"
                    title="Delete this certificate?"
                    description="This can't be undone."
                    confirmLabel="Delete"
                    aria-label="Delete certificate"
                  >
                    <X size={16} aria-hidden="true" />
                  </ConfirmButton>
                </form>
              }
            />
          ))}
        </div>
      )}
      <details className="settingsGroup">
        <summary className="settingsRow settingsAddTrigger">
          <span className="settingsRowIcon" aria-hidden="true">
            <Plus size={18} />
          </span>
          <span className="settingsRowText">
            <span className="settingsRowLabel">Add a certificate</span>
          </span>
        </summary>
        <div className="settingsAddPanelBody">
          <CertificateForm />
        </div>
      </details>

      <p className="settingsGroupLabel">Awards</p>
      {myAwards.length === 0 ? (
        <EmptyState message="No awards yet." />
      ) : (
        <div className="settingsGroup">
          {myAwards.map((award) => (
            <SettingsRow
              key={award.id}
              icon={AwardIcon}
              label={award.title}
              description={award.issuingOrg ?? undefined}
              trailing={
                <form action={deleteAward}>
                  <input type="hidden" name="awardId" value={award.id} />
                  <ConfirmButton
                    className="button buttonSecondary iconButton"
                    title="Delete this award?"
                    description="This can't be undone."
                    confirmLabel="Delete"
                    aria-label="Delete award"
                  >
                    <X size={16} aria-hidden="true" />
                  </ConfirmButton>
                </form>
              }
            />
          ))}
        </div>
      )}
      <details className="settingsGroup">
        <summary className="settingsRow settingsAddTrigger">
          <span className="settingsRowIcon" aria-hidden="true">
            <Plus size={18} />
          </span>
          <span className="settingsRowText">
            <span className="settingsRowLabel">Add an award</span>
          </span>
        </summary>
        <div className="settingsAddPanelBody">
          <AwardForm />
        </div>
      </details>
    </div>
  );
}
