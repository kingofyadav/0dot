import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getCommunityMember } from "@/lib/communities";
import { isGatedFromCommunityContent } from "@/lib/organizations";
import { getWikiPage } from "@/lib/wiki";
import { renderWikiMarkdown } from "@/lib/wiki-markdown";
import { SITE_DESCRIPTION } from "@/lib/site-metadata";
import { EditWikiPageForm } from "./EditWikiPageForm";

function excerptFor(body: string, max = 155): string {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length <= max) return trimmed;
  const cut = trimmed.lastIndexOf(" ", max);
  return `${trimmed.slice(0, cut > 0 ? cut : max)}…`;
}

// Same isGatedFromCommunityContent gate the page component uses — a
// private/org-restricted community's wiki gets no metadata for a
// non-member, matching what the page itself shows them (a "join to see
// this" placeholder, no content).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; wikiSlug: string }>;
}): Promise<Metadata> {
  const { slug: rawSlug, wikiSlug: rawWikiSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();
  const wikiSlug = decodeURIComponent(rawWikiSlug).toLowerCase();

  const community = await db.community.findUnique({
    where: { slug },
    select: { id: true, visibility: true, restrictedToOrganizationId: true },
  });
  if (!community || isGatedFromCommunityContent(community, false)) return {};

  const page = await getWikiPage(community.id, wikiSlug);
  if (!page || !page.currentRevision) return {};

  const title = page.title;
  const description = excerptFor(page.currentRevision.body) || SITE_DESCRIPTION;

  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary", title, description },
  };
}

export default async function WikiPageView({
  params,
}: {
  params: Promise<{ slug: string; wikiSlug: string }>;
}) {
  const { slug: rawSlug, wikiSlug: rawWikiSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();
  const wikiSlug = decodeURIComponent(rawWikiSlug).toLowerCase();

  const community = await db.community.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, visibility: true, wikiEditPolicy: true, restrictedToOrganizationId: true },
  });
  if (!community) notFound();

  const currentUser = await getCurrentUser();
  const membership = currentUser ? await getCommunityMember(community.id, currentUser.id) : null;
  const isActiveMember = membership?.status === "active" || membership?.status === "muted";
  if (isGatedFromCommunityContent(community, isActiveMember)) {
    return (
      <div className="profileCard">
        <p className="mutedText">This is a private community. Join to see its wiki.</p>
      </div>
    );
  }

  const page = await getWikiPage(community.id, wikiSlug);
  if (!page || !page.currentRevision) notFound();

  const canEdit =
    community.wikiEditPolicy === "members" ? membership?.status === "active" : membership?.role === "owner" || (membership?.role === "moderator" && membership?.status === "active");

  const editorName = page.currentRevision.editor.profile?.displayName ?? page.currentRevision.editor.username?.handle ?? "Unknown";

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{page.title}</h1>
        <span style={{ display: "flex", gap: "0.5rem" }}>
          <Link href={`/c/${community.slug}/wiki`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
            All pages
          </Link>
          <Link href={`/c/${community.slug}/wiki/${page.slug}/history`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
            History
          </Link>
        </span>
      </div>
      <p className="mutedText" style={{ fontSize: "0.8rem", marginBottom: "1rem" }}>
        Last edited by {editorName}
      </p>

      <div className="profileBio">{renderWikiMarkdown(page.currentRevision.body)}</div>

      {canEdit && (
        <details className="profileEditToggle" style={{ marginTop: "1.25rem" }}>
          <summary className="mutedText" style={{ fontSize: "0.85rem", cursor: "pointer" }}>
            Edit this page
          </summary>
          <div style={{ marginTop: "0.6rem" }}>
            <EditWikiPageForm wikiPageId={page.id} currentBody={page.currentRevision.body} />
          </div>
        </details>
      )}
    </div>
  );
}
