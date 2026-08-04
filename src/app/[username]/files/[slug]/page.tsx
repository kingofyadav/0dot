import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { EngagementSection } from "@/components/EngagementSection";
import { PublishedFileDownloadButton } from "@/components/PublishedFileDownloadButton";

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function PublishedFilePage({ params }: { params: Promise<{ username: string; slug: string }> }) {
  const { username: rawParam, slug: rawSlug } = await params;
  const handle = decodeURIComponent(rawParam).toLowerCase();
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const username = await db.username.findUnique({ where: { handle }, include: { user: { include: { profile: true } } } });
  if (!username?.user.profile) notFound();

  const file = await db.publishedFile.findUnique({ where: { profileId_slug: { profileId: username.user.profile.id, slug } } });
  if (!file) notFound();

  const currentUser = await getCurrentUser();
  const isOwner = currentUser?.id === username.user.id;
  if (!isOwner && file.visibility === "private") notFound();

  const [comments, isLiked, likeCount] = await Promise.all([
    db.comment.findMany({
      where: { subjectType: "published_file", subjectId: file.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: { author: { include: { username: true, profile: true } } },
    }),
    currentUser
      ? db.reaction.findUnique({ where: { subjectType_subjectId_userId: { subjectType: "published_file", subjectId: file.id, userId: currentUser.id } } })
      : null,
    db.reaction.count({ where: { subjectType: "published_file", subjectId: file.id } }),
  ]);

  return (
    <div className="profileCard">
      <Link href={`/${handle}/files`} className="mutedText" style={{ fontSize: "0.85rem" }}>
        ← {username.user.profile.displayName ?? handle}&rsquo;s files
      </Link>

      {file.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
        <img src={file.coverImageUrl} alt="" style={{ width: "100%", borderRadius: "10px", marginTop: "0.6rem", maxHeight: "320px", objectFit: "cover" }} />
      )}

      <h1 style={{ fontSize: "1.3rem", fontWeight: 700, marginTop: "0.6rem" }}>{file.title}</h1>
      <p className="mutedText" style={{ marginTop: "0.4rem", fontSize: "0.85rem" }}>
        PDF · {formatBytes(file.fileSizeBytes)} · {file.downloadCount} downloads
        {file.visibility === "unlisted" && " · Unlisted"}
        {file.visibility === "private" && " · Private"}
      </p>

      {isOwner && (
        <div style={{ marginTop: "0.5rem" }}>
          <Link href={`/s/${handle}/content/files#file-${file.id}`} className="button buttonSecondary buttonSmall">
            Edit file
          </Link>
        </div>
      )}

      {file.description && <p style={{ marginTop: "0.75rem" }}>{file.description}</p>}

      <div style={{ marginTop: "0.75rem" }}>
        {file.visibility === "public" && file.fileUrl ? (
          <a href={file.fileUrl} className="button buttonSecondary buttonSmall" download>Download</a>
        ) : (
          <PublishedFileDownloadButton fileId={file.id} />
        )}
      </div>

      <EngagementSection
        subjectType="published_file"
        subjectId={file.id}
        likeCount={likeCount}
        isLiked={Boolean(isLiked)}
        currentUserId={currentUser?.id ?? null}
        ownerId={username.user.id}
        showCommentForm
        comments={comments.map((c) => ({
          id: c.id,
          body: c.body,
          authorId: c.authorId,
          authorName: c.author.profile?.displayName ?? c.author.username?.handle ?? "Unknown",
        }))}
      />
    </div>
  );
}
