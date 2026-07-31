import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getBusinessMember, canManageCatalog } from "@/lib/businesses";
import { deleteDocument } from "@/app/actions/business-documents";
import { DocumentForm } from "./DocumentForm";

// build plan step 9 / spec §12: a simple file library. §12.2's literal
// acceptance criterion — team_only documents never reach a non-team-member
// — is enforced in this query (isTeamMember gates the visibility filter),
// not just hidden by the UI below it.
export default async function DocumentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const business = await db.business.findUnique({ where: { slug } });
  if (!business) notFound();

  const currentUser = await getCurrentUser();
  const membership = currentUser ? await getBusinessMember(business.id, currentUser.id) : null;
  if (business.status === "pending" && !membership) notFound();

  const isTeamMember = Boolean(membership);
  const canManage = currentUser ? await canManageCatalog(business.id, currentUser.id) : false;

  const documents = await db.businessDocument.findMany({
    where: {
      businessId: business.id,
      ...(isTeamMember ? {} : { visibility: "public" }),
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{business.name} — Documents</h1>
        <Link href={`/b/${business.slug}`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Back to business page
        </Link>
      </div>

      {canManage && (
        <details className="profileEditToggle" style={{ marginBottom: "1.5rem" }}>
          <summary className="sectionHeading" style={{ cursor: "pointer" }}>
            Upload a document
          </summary>
          <div style={{ marginTop: "0.6rem" }}>
            <DocumentForm businessId={business.id} />
          </div>
        </details>
      )}

      {documents.length === 0 && <p className="mutedText">Nothing here yet.</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {documents.map((doc) => (
          <div key={doc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
              {doc.title}
            </a>
            <span style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              {doc.visibility === "team_only" && <span className="mutedText" style={{ fontSize: "0.75rem" }}>Team only</span>}
              {canManage && (
                <form action={deleteDocument}>
                  <input type="hidden" name="documentId" value={doc.id} />
                  <button type="submit" className="button buttonDanger buttonSmall">
                    Delete
                  </button>
                </form>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
