import { db } from "@/lib/db";
import { verifyDownloadToken, streamProtectedFile } from "@/lib/protected-storage";
import { hasCourseAccess } from "@/lib/course-access";
import { hasTierAccess } from "@/lib/tier-access";

// spec §5.3/§5.4: the one path into storage/protected/ — verifies the
// signed token, then re-checks the purchase row still exists and its
// PaymentTransaction hasn't been refunded, at request time (not baked into
// the token once at issuance). A revoked/refunded purchase or a
// forged/expired/reused-past-another-buyer token all 404 identically —
// same "same response as nonexistent" posture as /r/[linkId] for an
// out-of-window link, so there's no signal to distinguish "wrong token"
// from "right token, no longer entitled."
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = verifyDownloadToken(token);
  if (!payload) return new Response("Not found", { status: 404 });

  if (payload.resourceType === "digital_product") {
    const purchase = await db.digitalProductPurchase.findFirst({
      where: { productId: payload.resourceId, buyerId: payload.userId },
      include: { product: true, paymentTransaction: { select: { status: true } } },
    });
    if (!purchase || purchase.paymentTransaction.status === "refunded") {
      return new Response("Not found", { status: 404 });
    }
    return streamProtectedFile(purchase.product.fileKey, purchase.product.fileMimeType, purchase.product.title, request);
  }

  // spec §9.3 web-playback path: a signed-in subscriber's browser session,
  // not the RSS feedToken mechanism (that's /api/podcasts/episodes/[id]/
  // audio) — re-checks hasTierAccess live here too, same "request time, not
  // token-issuance time" posture as the lesson case below.
  if (payload.resourceType === "podcast_episode") {
    const episode = await db.podcastEpisode.findUnique({ where: { id: payload.resourceId }, include: { podcast: true } });
    if (!episode) return new Response("Not found", { status: 404 });
    if (episode.requiredTierId) {
      const access = await hasTierAccess(payload.userId, episode.podcast.creatorId, episode.requiredTierId);
      if (!access) return new Response("Not found", { status: 404 });
    }
    return streamProtectedFile(episode.fileKey, episode.fileMimeType, episode.title, request, "inline");
  }

  // spec §11.2's first criterion: re-checks access here (request time),
  // not just at token issuance (requestLessonFileUrl in
  // src/app/actions/courses.ts) — a lapsed tier-bundled subscription stops
  // working the instant hasCourseAccess would return false, even mid-token
  // lifetime, since hasTierAccess is always computed live.
  const lesson = await db.lesson.findUnique({ where: { id: payload.resourceId }, include: { module: true } });
  if (!lesson || !lesson.fileKey || !lesson.fileMimeType) return new Response("Not found", { status: 404 });
  if (!(await hasCourseAccess(payload.userId, lesson.module.courseId))) return new Response("Not found", { status: 404 });

  const disposition = lesson.contentType === "video" ? "inline" : "attachment";
  return streamProtectedFile(lesson.fileKey, lesson.fileMimeType, lesson.title, request, disposition);
}
