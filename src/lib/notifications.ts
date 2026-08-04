import "server-only";
import { db } from "@/lib/db";
import { isBlocked } from "@/lib/blocks";
import { publishToUsers } from "@/lib/message-events";
import { extractMentionedHandles } from "@/lib/linkify";

// Plain server-only lib, deliberately NOT a "use server" action file.
// createNotification() trusts a bare recipientId/actorId with no ownership
// check of its own — every export of a "use server" module becomes a
// client-invokable server reference, and exposing this would let a crafted
// request create arbitrary notifications for arbitrary users. Every caller
// here is already another authenticated server action.

// Also used by /notifications' read-time grouping (same window definition
// must apply to both the write-side dedup and the read-side aggregation
// display — see that page).
export const AGGREGATION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

// Types whose volume benefits from display-time grouping ("Alice and 12
// others liked your post") — phase-2 spec §4.2. mention/new_follower are
// each independently meaningful and skip this entirely.
const DEDUPABLE_TYPES = new Set(["like", "comment"]);

type NotificationInput = {
  recipientId: string;
  actorId: string;
  type:
    | "like"
    | "comment"
    | "mention"
    | "new_follower"
    | "message"
    | "community_update"
    | "community_invite"
    | "business_review"
    | "job_application"
    | "application_status"
    | "appointment_request"
    | "appointment_confirmed"
    | "appointment_cancelled"
    | "tip_received"
    | "new_subscriber"
    | "affiliate_conversion"
    | "livestream_started";
  subjectType: "post" | "user" | "message" | "community" | "business" | "livestream" | "project" | "skill";
  subjectId: string;
};

async function createNotification({
  recipientId,
  actorId,
  type,
  subjectType,
  subjectId,
}: NotificationInput): Promise<void> {
  if (recipientId === actorId) return; // no self-notifications
  if (await isBlocked(recipientId, actorId)) return; // spec §4.5

  if (DEDUPABLE_TYPES.has(type)) {
    // App-level dedup, not a DB constraint — SQLite/Prisma can't cleanly
    // express the conditional unique index that would be ideal here, and a
    // real constraint would also block legitimate re-notification after a
    // long gap. Approximate, not a hard guarantee (see phase-2 plan's
    // flagged decision on this).
    const recent = await db.notification.findFirst({
      where: {
        recipientId,
        actorId,
        type,
        subjectId,
        createdAt: { gte: new Date(Date.now() - AGGREGATION_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (recent) return;
  }

  await db.notification.create({
    data: { recipientId, actorId, type, subjectType, subjectId },
  });

  // Live delivery (spec §2: "notified... within seconds... without
  // needing to refresh") — reuses the messaging SSE bus (see
  // message-events.ts's updated comment); MessagingProvider's blanket
  // router.refresh() picks up NotificationBell's fresh unread count with
  // no client-side changes needed here.
  publishToUsers([recipientId], { type: "notification" });
}

export function notifyLike(args: { recipientId: string; actorId: string; subjectId: string }): Promise<void> {
  return createNotification({ ...args, type: "like", subjectType: "post" });
}

export function notifyReply(args: { recipientId: string; actorId: string; subjectId: string }): Promise<void> {
  return createNotification({ ...args, type: "comment", subjectType: "post" });
}

export function notifyMention(args: { recipientId: string; actorId: string; subjectId: string }): Promise<void> {
  return createNotification({ ...args, type: "mention", subjectType: "post" });
}

// phase-6 spec §9.1: reuses the existing like/comment type values with
// subjectType: "project" instead of growing Notification.type — the
// restraint phase-3 §15/phase-4 §13 already showed, extended one step
// further (even the *subject* type list grows before the *action* type
// list does). subjectId is the project's *slug*, not its id — same "store
// exactly what getNotificationHref needs to route somewhere useful"
// precedent notifyCommunityUpdate/notifyBusinessReview already set, since
// /p/{slug} is what a viewer actually needs to reach the project.
// getNotificationHref/getNotificationVerb below both branch on subjectType
// to route/word these correctly instead of assuming "post" the way the
// bare like/comment case used to.
export function notifyProjectLike(args: { recipientId: string; actorId: string; projectSlug: string }): Promise<void> {
  return createNotification({ recipientId: args.recipientId, actorId: args.actorId, type: "like", subjectType: "project", subjectId: args.projectSlug });
}

export function notifyProjectComment(args: { recipientId: string; actorId: string; projectSlug: string }): Promise<void> {
  return createNotification({ recipientId: args.recipientId, actorId: args.actorId, type: "comment", subjectType: "project", subjectId: args.projectSlug });
}

// phase-6 spec §9.1: a skill endorsement also reuses "like" (§9.1: "a skill
// endorsement reuses like with subject_type = skill"). subjectId is the
// *skill's* id, not the endorser's — "like" is dedupable (DEDUPABLE_TYPES
// above), and dedup keys on (recipientId, actorId, type, subjectId); using
// the endorser's id there (the way notifyTipReceived uses subjectId=actorId)
// would make endorsing a second, different skill within the aggregation
// window silently produce no notification at all, since the same endorser
// would collide on the same key regardless of which skill. Keying on the
// skill's id instead means two different skills endorsed by the same
// person correctly produce two independent (and independently
// aggregatable) notifications. No skill permalink exists, so
// getNotificationHref still routes via the actor relation, not subjectId.
export function notifySkillEndorsement(args: { recipientId: string; actorId: string; skillId: string }): Promise<void> {
  return createNotification({ recipientId: args.recipientId, actorId: args.actorId, type: "like", subjectType: "skill", subjectId: args.skillId });
}

// Resolves @handles found in a post body to real users and fires a mention
// notification for each — extraction/capping lives in extractMentionedHandles
// (src/lib/linkify.tsx), not duplicated here. A mention of a non-existent
// handle silently resolves to nothing (phase-1 spec §5.2: no error, just
// doesn't become a notification, same as it doesn't become a link). Shared
// by every post-creating action (createPost, createQuoteRepost,
// createPollPost) — lives here rather than in one of those "use server"
// action files so it can be exported safely (see this file's top comment).
export async function notifyMentionsInBody(body: string, actorId: string, subjectId: string): Promise<void> {
  const handles = extractMentionedHandles(body);
  if (handles.length === 0) return;

  const mentionedUsers = await db.username.findMany({
    where: { handle: { in: handles } },
    select: { userId: true },
  });

  await Promise.all(
    mentionedUsers
      .filter((u) => u.userId !== actorId)
      .map((u) => notifyMention({ recipientId: u.userId, actorId, subjectId }))
  );
}

export function notifyNewFollower(args: { recipientId: string; actorId: string }): Promise<void> {
  return createNotification({ ...args, type: "new_follower", subjectType: "user", subjectId: args.actorId });
}

// phase-2 spec §5: subjectId is the conversationId, not a single message id
// — same "subjectId is whatever getNotificationHref needs to link
// somewhere useful" precedent notifyNewFollower already sets (subjectId is
// actorId there, not a distinct "follow" entity). Not aggregated (spec §4.2:
// "mention, new_follower, and message are not aggregated"), so this isn't
// added to DEDUPABLE_TYPES — every message produces its own row.
export function notifyMessage(args: { recipientId: string; actorId: string; subjectId: string }): Promise<void> {
  return createNotification({ ...args, type: "message", subjectType: "message" });
}

// phase-3 spec §15: subjectId is the community's *slug*, not its id — same
// "subjectId is whatever getNotificationHref needs to link somewhere
// useful" precedent notifyMessage/notifyNewFollower already set. A
// catch-all for structural/announcement changes (rule edit, wiki edit,
// promoted to moderator, join request approved) — content activity
// (replies, accepted answers) reuses the existing comment/mention types
// rather than growing this further, per spec §15.
export function notifyCommunityUpdate(args: {
  recipientId: string;
  actorId: string;
  communitySlug: string;
}): Promise<void> {
  return createNotification({
    recipientId: args.recipientId,
    actorId: args.actorId,
    type: "community_update",
    subjectType: "community",
    subjectId: args.communitySlug,
  });
}

// phase-3 spec §15: the one genuinely new type — no existing type covers
// "someone invited you to a private/restricted community" semantically.
// No producer wired yet: inviting isn't part of this build sequence (see
// docs/specs/phase-3-communities.md's §15 note) — schema/type ready, same
// state community_update itself was in before this batch.
export function notifyCommunityInvite(args: {
  recipientId: string;
  actorId: string;
  communitySlug: string;
}): Promise<void> {
  return createNotification({
    recipientId: args.recipientId,
    actorId: args.actorId,
    type: "community_invite",
    subjectType: "community",
    subjectId: args.communitySlug,
  });
}

// spec §13: fires to admin+ team members when a new Review is posted.
// subjectId is the business's slug — same "subjectId is whatever
// getNotificationHref needs to link somewhere useful" precedent
// notifyCommunityUpdate set, the reviews tab only needs the slug to route.
export function notifyBusinessReview(args: {
  recipientId: string;
  actorId: string;
  businessSlug: string;
}): Promise<void> {
  return createNotification({
    recipientId: args.recipientId,
    actorId: args.actorId,
    type: "business_review",
    subjectType: "business",
    subjectId: args.businessSlug,
  });
}

// spec §9.2: fires to admin+ team members when a new JobApplication is
// created. subjectId is the path segment after "/b/" needed to reach the
// applications queue (`{slug}/jobs/{jobId}`) — same "store exactly what the
// href needs" precedent as notifyBusinessReview above.
export function notifyJobApplication(args: {
  recipientId: string;
  actorId: string;
  businessSlug: string;
  jobId: string;
}): Promise<void> {
  return createNotification({
    recipientId: args.recipientId,
    actorId: args.actorId,
    type: "job_application",
    subjectType: "business",
    subjectId: `${args.businessSlug}/jobs/${args.jobId}`,
  });
}

// spec §9.2: a status change on a JobApplication notifies the applicant —
// always the applicant (never staff), so getNotificationHref can always
// route this type to the job's own page rather than the staff queue.
export function notifyApplicationStatusChange(args: {
  recipientId: string;
  actorId: string;
  businessSlug: string;
  jobId: string;
}): Promise<void> {
  return createNotification({
    recipientId: args.recipientId,
    actorId: args.actorId,
    type: "application_status",
    subjectType: "business",
    subjectId: `${args.businessSlug}/jobs/${args.jobId}`,
  });
}

// spec §13: appointment_request/confirmed/cancelled fire to "the relevant
// party" — staff for a new request, the customer for a confirmation or
// cancellation. subjectId is the business slug (both the staff manage page
// and the customer's own appointments page only need that to route).
export function notifyAppointmentRequest(args: {
  recipientId: string;
  actorId: string;
  businessSlug: string;
}): Promise<void> {
  return createNotification({
    recipientId: args.recipientId,
    actorId: args.actorId,
    type: "appointment_request",
    subjectType: "business",
    subjectId: args.businessSlug,
  });
}

export function notifyAppointmentConfirmed(args: {
  recipientId: string;
  actorId: string;
  businessSlug: string;
}): Promise<void> {
  return createNotification({
    recipientId: args.recipientId,
    actorId: args.actorId,
    type: "appointment_confirmed",
    subjectType: "business",
    subjectId: args.businessSlug,
  });
}

export function notifyAppointmentCancelled(args: {
  recipientId: string;
  actorId: string;
  businessSlug: string;
}): Promise<void> {
  return createNotification({
    recipientId: args.recipientId,
    actorId: args.actorId,
    type: "appointment_cancelled",
    subjectType: "business",
    subjectId: args.businessSlug,
  });
}

// phase-5 build plan §1 / spec §12: fires to the creator on a successful
// Tip. subjectId is the tipper's own id — same shape notifyNewFollower
// already uses (subjectId: actorId, not a distinct entity id); there's no
// dedicated tip permalink to route to, so getNotificationHref links to the
// tipper's profile via the included actor relation, not subjectId itself.
export function notifyTipReceived(args: { recipientId: string; actorId: string }): Promise<void> {
  return createNotification({
    recipientId: args.recipientId,
    actorId: args.actorId,
    type: "tip_received",
    subjectType: "user",
    subjectId: args.actorId,
  });
}

// spec §12: fires to the creator when a MembershipSubscription becomes
// active. subjectId is the new subscriber's own id — same shape
// notifyTipReceived/notifyNewFollower already use.
export function notifyNewSubscriber(args: { recipientId: string; actorId: string }): Promise<void> {
  return createNotification({
    recipientId: args.recipientId,
    actorId: args.actorId,
    type: "new_subscriber",
    subjectType: "user",
    subjectId: args.actorId,
  });
}

// spec §12: fires to the affiliate on a credited AffiliateConversion.
// subjectId is the buyer's id (the actor) — there's no dedicated
// conversion permalink, same "link to whoever caused this" precedent as
// tip_received.
export function notifyAffiliateConversion(args: { recipientId: string; actorId: string }): Promise<void> {
  return createNotification({
    recipientId: args.recipientId,
    actorId: args.actorId,
    type: "affiliate_conversion",
    subjectType: "user",
    subjectId: args.actorId,
  });
}

// spec §12: fires to qualifying subscribers/followers when a creator's
// Livestream transitions to `live`. subjectId is the livestream id — the
// one type here that needs a real subjectId (not just "the actor") since
// getNotificationHref must route to the specific stream, not the
// creator's profile.
export function notifyLivestreamStarted(args: { recipientId: string; actorId: string; livestreamId: string }): Promise<void> {
  return createNotification({
    recipientId: args.recipientId,
    actorId: args.actorId,
    type: "livestream_started",
    subjectType: "livestream",
    subjectId: args.livestreamId,
  });
}

export function getUnreadNotificationCount(userId: string): Promise<number> {
  return db.notification.count({ where: { recipientId: userId, readAt: null } });
}

const previewActorInclude = { username: true, profile: true } as const;

// Unaggregated — fine for a 3-5 item rail preview; the full /notifications
// list applies read-time aggregation (see that page).
export function getRecentNotificationsPreview(userId: string, limit: number) {
  return db.notification.findMany({
    where: { recipientId: userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { include: previewActorInclude } },
  });
}

// Shared by the rail preview and the full /notifications list — a single
// actor's action reads as "{name} {verb}"; the full list composes the same
// verb onto an aggregated group ("{name} and 12 others {verb}").
// phase-6: like/comment are shared by post, project, and (like only) skill
// subjects now — subjectType picks the right wording. Defaults to the
// original post-only wording when subjectType is omitted so every existing
// call site (which only ever produced post notifications) keeps working
// unchanged.
export function getNotificationVerb(type: string, subjectType?: string): string {
  switch (type) {
    case "like":
      if (subjectType === "project") return "liked your project";
      if (subjectType === "skill") return "endorsed your skill";
      return "liked your post";
    case "comment":
      if (subjectType === "project") return "commented on your project";
      return "replied to your post";
    case "mention":
      return "mentioned you";
    case "new_follower":
      return "followed you";
    case "message":
      return "sent you a message";
    // Generic by design — community_update is a spec-defined catch-all
    // (§15) covering several distinct underlying events (rule edit, wiki
    // edit, promotion, join approval) with no per-event verb text stored;
    // the link (getNotificationHref) still takes the recipient to the
    // right community. A documented imprecision, not an oversight — same
    // class of accepted gap as this function's mention-inside-a-reply case
    // below.
    case "community_update":
      return "updated a community you're in";
    case "community_invite":
      return "invited you to join a community";
    case "business_review":
      return "left a review on your business";
    case "job_application":
      return "applied to a job posting";
    case "application_status":
      return "updated your application status";
    case "appointment_request":
      return "requested an appointment";
    case "appointment_confirmed":
      return "confirmed your appointment";
    case "appointment_cancelled":
      return "cancelled your appointment";
    case "tip_received":
      return "sent you a tip";
    case "new_subscriber":
      return "subscribed to your membership";
    case "affiliate_conversion":
      return "made a purchase through your affiliate link";
    case "livestream_started":
      return "started a livestream";
    default:
      return "";
  }
}

// No single-post permalink page exists in this codebase yet (pre-existing
// Phase 1 gap — see COMPONENT_LIBRARY.md's "Comment thread" entry). Like/
// reply notifications link to the recipient's own profile with an in-page
// anchor (their own top-level posts are always listed there — see the
// id={"post-"+post.id} added to PostCard/MiniPostCard). Mentions/follows
// link to the actor's profile directly. A mention inside a reply has no
// reachable anchor (profile Posts queries filter replyToId: null) — this
// degrades to the actor's bare profile URL in that case, an accepted gap.
export function getNotificationHref(
  n: {
    type: string;
    subjectId: string;
    subjectType: string;
    actor: { username: { handle: string } | null } | null;
  },
  recipientHandle: string | null
): string {
  switch (n.type) {
    // phase-6: like/comment now also fire for project subjects (routes to
    // the project's own permalink, subjectId = slug — see
    // notifyProjectLike/notifyProjectComment) and skill subjects (no
    // permalink to route to, so it falls through to the actor-profile case
    // below alongside tip_received/new_subscriber). Must check subjectType
    // first — assuming "post" unconditionally here was the bug this phase
    // found: a project like would otherwise mis-route to a nonexistent
    // #post-{projectId} anchor on the recipient's own profile.
    case "like":
    case "comment":
      if (n.subjectType === "project") return `/p/${n.subjectId}`;
      if (n.subjectType === "skill") {
        return n.actor?.username?.handle ? `/${n.actor.username.handle}` : "/feed";
      }
      return recipientHandle ? `/${recipientHandle}#post-${n.subjectId}` : "/feed";
    case "mention":
    case "new_follower":
    case "tip_received":
    case "new_subscriber":
    case "affiliate_conversion":
      return n.actor?.username?.handle ? `/${n.actor.username.handle}` : "/feed";
    case "message":
      return `/messages/${n.subjectId}`;
    case "community_update":
    case "community_invite":
      return `/c/${n.subjectId}`;
    case "business_review":
      return `/b/${n.subjectId}/reviews`;
    case "job_application":
      return `/b/${n.subjectId}/applications`;
    case "application_status":
      return `/b/${n.subjectId}`;
    case "appointment_request":
      return `/b/${n.subjectId}/appointments/manage`;
    case "appointment_confirmed":
    case "appointment_cancelled":
      return `/b/${n.subjectId}/appointments`;
    case "livestream_started":
      return `/live/${n.subjectId}`;
    default:
      return "/notifications";
  }
}
