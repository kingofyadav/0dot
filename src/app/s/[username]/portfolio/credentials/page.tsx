import { redirect } from "next/navigation";
import { X } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteResearchPaper, deleteCertificate, deleteAward } from "@/app/actions/credentials";
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

      <p className="sectionHeading">Research papers</p>
      {myResearchPapers.length === 0 && <p className="mutedText">No papers yet.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {myResearchPapers.map((paper) => (
          <div key={paper.id} className="profileLinkItem" style={{ justifyContent: "space-between" }}>
            <span>
              {paper.title} <span className="mutedText">— {paper.authors}</span>
            </span>
            <form action={deleteResearchPaper}>
              <input type="hidden" name="researchPaperId" value={paper.id} />
              <button type="submit" className="button buttonSecondary iconButton" aria-label="Delete paper"><X size={16} aria-hidden="true" /></button>
            </form>
          </div>
        ))}
      </div>
      <details className="profileEditToggle" style={{ marginTop: "0.5rem" }}>
        <summary>Add a paper</summary>
        <div style={{ marginTop: "0.5rem" }}>
          <ResearchPaperForm ownProjects={myProjects.map((p) => ({ id: p.id, title: p.title }))} />
        </div>
      </details>

      <p className="sectionHeading" style={{ marginTop: "1.5rem" }}>Certificates</p>
      <p className="mutedText" style={{ fontSize: "0.8rem" }}>Self-reported — not verified by 0dot. Add a verification link so viewers can check independently.</p>
      {myCertificates.length === 0 && <p className="mutedText">No certificates yet.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {myCertificates.map((cert) => (
          <div key={cert.id} className="profileLinkItem" style={{ justifyContent: "space-between" }}>
            <span>
              {cert.title} <span className="mutedText">— {cert.issuingOrg}</span>
            </span>
            <form action={deleteCertificate}>
              <input type="hidden" name="certificateId" value={cert.id} />
              <button type="submit" className="button buttonSecondary iconButton" aria-label="Delete certificate"><X size={16} aria-hidden="true" /></button>
            </form>
          </div>
        ))}
      </div>
      <details className="profileEditToggle" style={{ marginTop: "0.5rem" }}>
        <summary>Add a certificate</summary>
        <div style={{ marginTop: "0.5rem" }}>
          <CertificateForm />
        </div>
      </details>

      <p className="sectionHeading" style={{ marginTop: "1.5rem" }}>Awards</p>
      {myAwards.length === 0 && <p className="mutedText">No awards yet.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {myAwards.map((award) => (
          <div key={award.id} className="profileLinkItem" style={{ justifyContent: "space-between" }}>
            <span>
              {award.title} {award.issuingOrg && <span className="mutedText">— {award.issuingOrg}</span>}
            </span>
            <form action={deleteAward}>
              <input type="hidden" name="awardId" value={award.id} />
              <button type="submit" className="button buttonSecondary iconButton" aria-label="Delete award"><X size={16} aria-hidden="true" /></button>
            </form>
          </div>
        ))}
      </div>
      <details className="profileEditToggle" style={{ marginTop: "0.5rem" }}>
        <summary>Add an award</summary>
        <div style={{ marginTop: "0.5rem" }}>
          <AwardForm />
        </div>
      </details>
    </div>
  );
}
