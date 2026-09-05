import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Heart, Star, X } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { renderWikiMarkdown } from "@/lib/wiki-markdown";
import { toggleProjectLike, deleteProjectComment } from "@/app/actions/projects";
import { ProjectCommentForm } from "./ProjectCommentForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { JsonLd } from "@/components/JsonLd";
import { SITE_DESCRIPTION } from "@/lib/site-metadata";

// No visibility gate here, matching the page component's own comment: an
// unlisted project resolves via direct link same as a public one
// (obscurity, not access control) — so there's no "don't describe this to
// a scraper" case to handle, unlike every gated content type above.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();
  const project = await db.project.findUnique({ where: { slug }, select: { title: true, summary: true, coverImageUrl: true } });
  if (!project) return {};

  const title = project.title;
  const description = project.summary || SITE_DESCRIPTION;
  const images = project.coverImageUrl ? [project.coverImageUrl] : undefined;

  return {
    title,
    description,
    openGraph: { title, description, images, type: "website" },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

function projectJsonLd(project: { title: string; summary: string; coverImageUrl: string | null }, creatorName: string, url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: project.title,
    description: project.summary || SITE_DESCRIPTION,
    creator: { "@type": "Person", name: creatorName },
    ...(project.coverImageUrl ? { image: [project.coverImageUrl] } : {}),
    url,
  };
}

const STATUS_LABEL: Record<string, string> = {
  in_progress: "In progress",
  completed: "Completed",
  archived: "Archived",
};

function formatDate(date: Date | null): string | null {
  return date ? date.toLocaleDateString(undefined, { year: "numeric", month: "short" }) : null;
}

// spec §3.3: unlisted projects resolve here via direct link (this page does
// no visibility filtering of its own — it looks the project up by slug and
// renders it) but are excluded from the owner's public listing and from
// search (see [username]/page.tsx and search/page.tsx) — obscurity, not
// access control, per the spec's explicit caveat.
export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const project = await db.project.findUnique({
    where: { slug },
    include: {
      owner: { include: { username: true, profile: true } },
      collaborators: { include: { user: { include: { username: true } } }, orderBy: { createdAt: "asc" } },
      skills: { include: { skill: true } },
      gitRepositories: true,
      comments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: { author: { include: { username: true, profile: true } } },
      },
    },
  });
  if (!project) notFound();

  const currentUser = await getCurrentUser();
  const isOwner = currentUser?.id === project.ownerId;
  const isLiked = currentUser
    ? Boolean(await db.projectLike.findUnique({ where: { projectId_userId: { projectId: project.id, userId: currentUser.id } } }))
    : false;

  const gallery: string[] = project.galleryJson ? JSON.parse(project.galleryJson) : [];
  const links: { label: string; url: string }[] = project.externalLinksJson ? JSON.parse(project.externalLinksJson) : [];
  const ownerHandle = project.owner.username?.handle;

  return (
    <div className="profileCard">
      <JsonLd data={projectJsonLd(project, project.owner.profile?.displayName ?? ownerHandle ?? "Unknown", `https://0dot.in/p/${slug}`)} />
      {ownerHandle && (
        <Link href={`/${ownerHandle}`} className="mutedText" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem" }}>
          <ArrowLeft size={14} aria-hidden="true" /> {project.owner.profile?.displayName ?? ownerHandle}
        </Link>
      )}

      {project.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
        <img src={project.coverImageUrl} alt={project.title} style={{ width: "100%", borderRadius: "10px", marginTop: "0.6rem", maxHeight: "320px", objectFit: "cover" }} />
      )}

      <h1 style={{ fontSize: "1.3rem", fontWeight: 700, marginTop: "0.6rem" }}>{project.title}</h1>
      {project.summary && <p className="mutedText" style={{ marginTop: "0.2rem" }}>{project.summary}</p>}

      <p className="mutedText" style={{ marginTop: "0.4rem", fontSize: "0.85rem" }}>
        {STATUS_LABEL[project.status]}
        {formatDate(project.startedAt) && ` · Started ${formatDate(project.startedAt)}`}
        {formatDate(project.completedAt) && ` · Completed ${formatDate(project.completedAt)}`}
        {project.visibility === "unlisted" && " · Unlisted"}
      </p>

      {isOwner && (
        <div style={{ marginTop: "0.5rem" }}>
          <Link href={`/s/${ownerHandle}#project-${project.id}`} className="button buttonSecondary buttonSmall">
            Edit project
          </Link>
        </div>
      )}

      {project.description && (
        <div style={{ marginTop: "0.75rem" }}>{renderWikiMarkdown(project.description)}</div>
      )}

      {gallery.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.75rem" }}>
          {gallery.map((url, index) => (
            // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
            <img key={url} src={url} alt={`${project.title} — image ${index + 1}`} style={{ width: "140px", height: "140px", objectFit: "cover", borderRadius: "8px" }} />
          ))}
        </div>
      )}

      {links.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", marginTop: "0.75rem" }}>
          {links.map((link) => (
            <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="button buttonSecondary buttonSmall">
              {link.label}
            </a>
          ))}
        </div>
      )}

      {project.skills.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.75rem" }}>
          {project.skills.map(({ skill }) => (
            <span key={skill.id} className="mutedText" style={{ fontSize: "0.8rem", border: "1px solid var(--border)", borderRadius: "999px", padding: "0.15rem 0.6rem" }}>
              {skill.name}
            </span>
          ))}
        </div>
      )}

      {project.gitRepositories.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }}>
          {project.gitRepositories.map((repo) => (
            <a
              key={repo.id}
              href={repo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="button buttonSecondary buttonSmall"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
            >
              {repo.displayName}
              {repo.starCount !== null && (
                <>
                  · <Star size={12} aria-hidden="true" /> {repo.starCount}
                </>
              )}
            </a>
          ))}
        </div>
      )}

      {project.collaborators.length > 0 && (
        <div style={{ marginTop: "0.75rem" }}>
          <p className="sectionHeading">Collaborators</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {project.collaborators.map((c) => {
              const name = c.user?.username?.handle ? c.user.username.handle : c.displayName;
              const content = (
                <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                  {name}
                  {c.role && ` — ${c.role}`}
                </span>
              );
              return c.user?.username?.handle ? (
                <Link key={c.id} href={`/${c.user.username.handle}`}>
                  {content}
                </Link>
              ) : (
                <span key={c.id}>{content}</span>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginTop: "0.9rem", display: "flex", gap: "0.5rem" }}>
        {currentUser && (
          <form action={toggleProjectLike}>
            <input type="hidden" name="projectId" value={project.id} />
            <button
              type="submit"
              className="button buttonSecondary iconButton"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                ...(isLiked ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined),
              }}
              aria-pressed={isLiked}
            >
              <Heart size={16} aria-hidden="true" fill={isLiked ? "currentColor" : "none"} /> {project.likeCount}
            </button>
          </form>
        )}
        {!currentUser && (
          <span className="mutedText" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem" }}>
            <Heart size={14} aria-hidden="true" /> {project.likeCount}
          </span>
        )}
      </div>

      <div style={{ marginTop: "1rem" }}>
        <p className="sectionHeading">Comments ({project.commentCount})</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {project.comments.map((comment) => (
            <div key={comment.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.2rem" }}>
              <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                {comment.author.profile?.displayName ?? comment.author.username?.handle ?? "Unknown"}
              </span>
              <span>{comment.body}</span>
              {currentUser && (currentUser.id === comment.authorId || currentUser.id === project.ownerId) && (
                <form action={deleteProjectComment} style={{ alignSelf: "flex-end" }}>
                  <input type="hidden" name="commentId" value={comment.id} />
                  <ConfirmButton
                    className="button buttonSecondary iconButton"
                    title="Delete this comment?"
                    description="This can't be undone."
                    confirmLabel="Delete"
                    aria-label="Delete comment"
                  >
                    <X size={16} aria-hidden="true" />
                  </ConfirmButton>
                </form>
              )}
            </div>
          ))}
        </div>
        {currentUser && <ProjectCommentForm projectId={project.id} />}
      </div>
    </div>
  );
}
