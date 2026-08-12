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
    | "follow_request"
    | "follow_accepted"
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
    | "livestream_started"
    | "event_cancelled"
    | "report_acknowledged"
    | "case_resolved"
    | "appeal_decided"
    | "dmca_notice_received"
    | "dmca_content_removed"
    | "dmca_counter_notice_received"
    | "dmca_content_restored"
    | "dmca_strike_issued"
    | "org_member_added"
    | "org_member_deactivated"
    | "org_sso_configured";
  subjectType: "post" | "user" | "message" | "community" | "business" | "livestream" | "project" | "skill" | "article" | "wiki_page" | "book" | "published_file" | "event" | "trust_safety_case" | "appeal" | "dmca_takedown_notice" | "dmca_counter_notice" | "organization";
  subjectId: string;
};

// phase-10 spec §7.1: a system-generated notification with no human actor
// — bypasses createNotification's recipientId!==actorId self-notification
// guard (which doesn't apply here) and its dedup/block checks (irrelevant
// for a platform-to-developer notice, not a social interaction). actorId
// is nullable on the schema specifically for cases like this.
export async function notifyWebhookDisabled(args: { recipientId: string; subjectId: string }): Promise<void> {
  await db.notification.create({
    data: { recipientId: args.recipientId, actorId: null, type: "webhook_disabled", subjectType: "developer_app", subjectId: args.subjectId },
  });
  publishToUsers([args.recipientId], { type: "notification" });
}

// custom-domains addendum §10 step 6 / §7.2's acceptance criterion: a
// renewal failure must notify the owner, not just log internally — same
// system-initiated shape as notifyWebhookDisabled. No code path in this
// build's stub SSL provisioning (custom-domains.ts's verifyDomainRouting,
// which simulates ACME success instantly once routing verifies) can
// actually reach ssl_status = renewal_failed, since there's no real
// certificate-renewal loop to fail — this exists for a real ACME
// integration to call once one exists, not exercised by anything today.
export async function notifyCustomDomainSslRenewalFailed(args: { recipientId: string; customDomainId: string }): Promise<void> {
  await db.notification.create({
    data: { recipientId: args.recipientId, actorId: null, type: "custom_domain_ssl_renewal_failed", subjectType: "custom_domain", subjectId: args.customDomainId },
  });
  publishToUsers([args.recipientId], { type: "notification" });
}

// custom-domains addendum §10 step 6: sent once, on the transition into
// suspended_nonpayment (custom-domains.ts's sweepBillingLapse) — not
// re-sent on every subsequent sweep tick while it stays suspended.
export async function notifyCustomDomainSuspendedNonpayment(args: { recipientId: string; customDomainId: string }): Promise<void> {
  await db.notification.create({
    data: { recipientId: args.recipientId, actorId: null, type: "custom_domain_suspended_nonpayment", subjectType: "custom_domain", subjectId: args.customDomainId },
  });
  publishToUsers([args.recipientId], { type: "notification" });
}

// custom-domains addendum §10 step 6: sent on a *regression* — a
// previously-verified domain's DNS routing breaking — not on every failed
// poll while a fresh claim is still mid-setup (that would fire on nearly
// every claim, since routing_verified is rarely instant).
export async function notifyCustomDomainRoutingFailed(args: { recipientId: string; customDomainId: string }): Promise<void> {
  await db.notification.create({
    data: { recipientId: args.recipientId, actorId: null, type: "custom_domain_routing_failed", subjectType: "custom_domain", subjectId: args.customDomainId },
  });
  publishToUsers([args.recipientId], { type: "notification" });
}

// phase-11 spec §4.3 acceptance criterion: sent for `upheld` ModerationFlag
// outcomes on ordinary categories only — never for the wholly separate
// CSAM pipeline (§4.2), which follows its own legally-governed rules about
// what (if anything) the uploader is told. System-initiated (no actor),
// same shape as notifyWebhookDisabled.
export async function notifyModerationAction(args: { recipientId: string; subjectType: string; subjectId: string }): Promise<void> {
  await db.notification.create({
    data: {
      recipientId: args.recipientId,
      actorId: null,
      type: "moderation_action",
      subjectType: args.subjectType,
      subjectId: args.subjectId,
    },
  });
  publishToUsers([args.recipientId], { type: "notification" });
}

// phase-12 spec §11 step 8: system-initiated (no actor), same shape as
// notifyModerationAction — sent to a Report's reporter once its
// TrustSafetyCase resolves, and to the case subject's owner separately
// (notifyCaseResolved). Neither ever carries reporter identity in the
// other direction (§4.2's anonymity requirement) — these are two distinct
// one-way notices, not a shared payload.
export async function notifyReportAcknowledged(args: { recipientId: string; caseId: string }): Promise<void> {
  await db.notification.create({
    data: { recipientId: args.recipientId, actorId: null, type: "report_acknowledged", subjectType: "trust_safety_case", subjectId: args.caseId },
  });
  publishToUsers([args.recipientId], { type: "notification" });
}

export async function notifyCaseResolved(args: { recipientId: string; caseId: string }): Promise<void> {
  await db.notification.create({
    data: { recipientId: args.recipientId, actorId: null, type: "case_resolved", subjectType: "trust_safety_case", subjectId: args.caseId },
  });
  publishToUsers([args.recipientId], { type: "notification" });
}

export async function notifyAppealDecided(args: { recipientId: string; appealId: string }): Promise<void> {
  await db.notification.create({
    data: { recipientId: args.recipientId, actorId: null, type: "appeal_decided", subjectType: "appeal", subjectId: args.appealId },
  });
  publishToUsers([args.recipientId], { type: "notification" });
}

// phase-13 spec §12 step 8: the DMCA lifecycle's five producers. None carry
// a human actorId — same "system-generated" posture as the trust-safety
// notifications above. The complainant is never a notification recipient:
// unlike every other party here, they aren't necessarily a platform user
// (real-world DMCA notices routinely come from rights holders with no
// account), so there's no userId to notify even in principle.
export async function notifyDmcaNoticeReceived(args: { recipientId: string; noticeId: string }): Promise<void> {
  await db.notification.create({
    data: { recipientId: args.recipientId, actorId: null, type: "dmca_notice_received", subjectType: "dmca_takedown_notice", subjectId: args.noticeId },
  });
  publishToUsers([args.recipientId], { type: "notification" });
}

export async function notifyDmcaContentRemoved(args: { recipientId: string; noticeId: string }): Promise<void> {
  await db.notification.create({
    data: { recipientId: args.recipientId, actorId: null, type: "dmca_content_removed", subjectType: "dmca_takedown_notice", subjectId: args.noticeId },
  });
  publishToUsers([args.recipientId], { type: "notification" });
}

// Confirms receipt to the counter-notifier themselves (the only party on
// this event guaranteed to hold an account, per the comment above).
export async function notifyDmcaCounterNoticeReceived(args: { recipientId: string; counterNoticeId: string }): Promise<void> {
  await db.notification.create({
    data: { recipientId: args.recipientId, actorId: null, type: "dmca_counter_notice_received", subjectType: "dmca_counter_notice", subjectId: args.counterNoticeId },
  });
  publishToUsers([args.recipientId], { type: "notification" });
}

export async function notifyDmcaContentRestored(args: { recipientId: string; counterNoticeId: string }): Promise<void> {
  await db.notification.create({
    data: { recipientId: args.recipientId, actorId: null, type: "dmca_content_restored", subjectType: "dmca_counter_notice", subjectId: args.counterNoticeId },
  });
  publishToUsers([args.recipientId], { type: "notification" });
}

export async function notifyDmcaStrikeIssued(args: { recipientId: string; noticeId: string }): Promise<void> {
  await db.notification.create({
    data: { recipientId: args.recipientId, actorId: null, type: "dmca_strike_issued", subjectType: "dmca_takedown_notice", subjectId: args.noticeId },
  });
  publishToUsers([args.recipientId], { type: "notification" });
}

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

  // phase-10 spec §7.1 / phase-15 spec §4.2 / account-settings-hardening
  // addendum §8: webhooks, push, and email are three independent consumers
  // of this same event (none depends on another's result), so they run
  // concurrently rather than paying all three latencies serially on every
  // notification for every recipient. Dynamic imports avoid load-time
  // cycles (webhooks.ts imports notifyWebhookDisabled, push.ts and
  // email.ts both import getNotificationVerb, all from this module).
  await Promise.all([
    import("@/lib/webhooks").then(({ dispatchWebhookEvent }) => dispatchWebhookEvent({ recipientId, type, subjectType, subjectId })),
    import("@/lib/push").then(({ dispatchPushEvent }) => dispatchPushEvent({ recipientId, type, subjectType, subjectId })),
    import("@/lib/email").then(({ dispatchEmailEvent }) => dispatchEmailEvent({ recipientId, type, subjectType, subjectId })),
  ]);
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

// phase-7 spec §4.2: the generalized Reaction/Comment primitive (§4) reuses
// "like"/comment the same restrained way phase-6 did for project/skill —
// no new Notification.type values. Generic across all four subject types
// the primitive now covers (article/wiki_page/book/published_file, spec §12
// steps 2/5/7/9) rather than one bespoke notify pair per type — the
// per-type version (notifyArticleLike/Comment) was refactored into this the
// moment a second call site (wiki_page) needed the identical shape. `path`
// is the full route (no leading slash) getNotificationHref needs — same
// "store exactly what the href needs" precedent notifyJobApplication set —
// since every one of these routes is scoped under an owner's handle, not a
// flat global namespace the way /p/{slug} is.
// subjectType is a plain string here rather than NotificationInput's
// literal union — the caller (reactions.ts) already restricts it to a
// known-good value via its own SUBJECT_RESOLVERS map before ever reaching
// this function, so re-deriving that same literal union at this boundary
// would just duplicate the source of truth. Cast, not re-validated.
export function notifyReactionLike(args: { recipientId: string; actorId: string; subjectType: string; path: string }): Promise<void> {
  return createNotification({ recipientId: args.recipientId, actorId: args.actorId, type: "like", subjectType: args.subjectType as NotificationInput["subjectType"], subjectId: args.path });
}

export function notifyReactionComment(args: { recipientId: string; actorId: string; subjectType: string; path: string }): Promise<void> {
  return createNotification({ recipientId: args.recipientId, actorId: args.actorId, type: "comment", subjectType: args.subjectType as NotificationInput["subjectType"], subjectId: args.path });
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
    select: { userId: true, user: { select: { profile: { select: { allowTagging: true } } } } },
  });

  await Promise.all(
    mentionedUsers
      // addendum-account-settings-hardening.md §9: Profile.allowTagging=false
      // means a mention resolves to nothing, same "no error, just doesn't
      // become a notification" posture this function already uses for
      // handles that don't match any user at all.
      .filter((u) => u.userId !== actorId && u.user.profile?.allowTagging !== false)
      .map((u) => notifyMention({ recipientId: u.userId, actorId, subjectId }))
  );
}

export function notifyNewFollower(args: { recipientId: string; actorId: string }): Promise<void> {
  return createNotification({ ...args, type: "new_follower", subjectType: "user", subjectId: args.actorId });
}

// Private-account counterpart to notifyNewFollower (see followUser,
// src/app/actions/follow.ts) — fires instead of it when the target's
// Profile.isPrivate is true, since the Follow row is only "pending" at this
// point. subjectId is the requester's own id, same shape notifyNewFollower
// already uses (there's no distinct "follow request" entity to point at).
export function notifyFollowRequest(args: { recipientId: string; actorId: string }): Promise<void> {
  return createNotification({ ...args, type: "follow_request", subjectType: "user", subjectId: args.actorId });
}

// Fires to the original requester once acceptFollowRequest flips their
// pending row to "accepted" — actorId is the account that just accepted
// them, subjectId mirrors it, same shape as notifyFollowRequest.
export function notifyFollowRequestAccepted(args: { recipientId: string; actorId: string }): Promise<void> {
  return createNotification({ ...args, type: "follow_accepted", subjectType: "user", subjectId: args.actorId });
}

// phase-14 spec §10 step 8: the three org-scoped producers, sequenced last
// in that build plan since they describe outcomes of steps built earlier
// (member add/deactivate, SSO configure). subjectId is the organizationId
// in all three — see getNotificationHref's org_* cases above.
export function notifyOrgMemberAdded(args: { recipientId: string; actorId: string; organizationId: string }): Promise<void> {
  return createNotification({ recipientId: args.recipientId, actorId: args.actorId, type: "org_member_added", subjectType: "organization", subjectId: args.organizationId });
}

export function notifyOrgMemberDeactivated(args: { recipientId: string; actorId: string; organizationId: string }): Promise<void> {
  return createNotification({ recipientId: args.recipientId, actorId: args.actorId, type: "org_member_deactivated", subjectType: "organization", subjectId: args.organizationId });
}

export function notifyOrgSsoConfigured(args: { recipientId: string; actorId: string; organizationId: string }): Promise<void> {
  return createNotification({ recipientId: args.recipientId, actorId: args.actorId, type: "org_sso_configured", subjectType: "organization", subjectId: args.organizationId });
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

// phase-16 spec §4: fires when a newly posted Job matches a saved
// JobAlert — no human actor (system-generated match), same
// bypass-createNotification posture as notifyWebhookDisabled above.
// subjectId is `{businessSlug}/jobs/{jobId}`, same shape as
// job_application/application_status above, so getNotificationHref can
// route it the same way.
export async function notifyJobAlertMatch(args: { recipientId: string; businessSlug: string; jobId: string }): Promise<void> {
  const subjectId = `${args.businessSlug}/jobs/${args.jobId}`;
  await db.notification.create({
    data: {
      recipientId: args.recipientId,
      actorId: null,
      type: "job_alert_match",
      subjectType: "business",
      subjectId,
    },
  });
  publishToUsers([args.recipientId], { type: "notification" });

  // Bypasses createNotification (no human actor, same posture as every
  // other system-generated notifier above), so — like
  // createSystemEventNotification — it needs its own push dispatch rather
  // than inheriting createNotification's. This was missing: a user with
  // push enabled and a saved job alert got the in-app notification but
  // never a push for a new matching job.
  const { dispatchPushEvent } = await import("@/lib/push");
  await dispatchPushEvent({ recipientId: args.recipientId, type: "job_alert_match", subjectType: "business", subjectId });
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
// phase-9 spec §3.2: an individual seller has no business slug to route
// through, so the owner ref is now a discriminated union — subjectType
// becomes "user" (subjectId = seller's handle) for that case, "business"
// (subjectId = slug, unchanged) otherwise. getNotificationHref branches on
// subjectType for these three types accordingly.
type AppointmentOwnerRef = { businessSlug: string; sellerHandle?: undefined } | { sellerHandle: string; businessSlug?: undefined };

function appointmentOwnerSubject(owner: AppointmentOwnerRef): Pick<NotificationInput, "subjectType" | "subjectId"> {
  return owner.businessSlug !== undefined
    ? { subjectType: "business", subjectId: owner.businessSlug }
    : { subjectType: "user", subjectId: owner.sellerHandle };
}

export function notifyAppointmentRequest(
  args: { recipientId: string; actorId: string } & AppointmentOwnerRef
): Promise<void> {
  return createNotification({
    recipientId: args.recipientId,
    actorId: args.actorId,
    type: "appointment_request",
    ...appointmentOwnerSubject(args),
  });
}

export function notifyAppointmentConfirmed(
  args: { recipientId: string; actorId: string } & AppointmentOwnerRef
): Promise<void> {
  return createNotification({
    recipientId: args.recipientId,
    actorId: args.actorId,
    type: "appointment_confirmed",
    ...appointmentOwnerSubject(args),
  });
}

export function notifyAppointmentCancelled(
  args: { recipientId: string; actorId: string } & AppointmentOwnerRef
): Promise<void> {
  return createNotification({
    recipientId: args.recipientId,
    actorId: args.actorId,
    type: "appointment_cancelled",
    ...appointmentOwnerSubject(args),
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

// phase-8 spec §8.2/§8.4: fires to every current EventRSVP (going/interested)
// and every non-cancelled Ticket holder on an event's published->cancelled
// transition — not ticket-holders-only (§8.4's literal acceptance
// criterion). subjectId is the event's slug, same "subjectId is whatever
// getNotificationHref needs to link somewhere useful" precedent every other
// producer here follows. actorId is the host/staff member who cancelled —
// a real second party in the normal case, so this goes through the shared
// createNotification (including its self-notification skip, which is the
// right behavior if a host who'd also RSVP'd cancels their own event).
export function notifyEventCancelled(args: { recipientId: string; actorId: string; eventSlug: string }): Promise<void> {
  return createNotification({
    recipientId: args.recipientId,
    actorId: args.actorId,
    type: "event_cancelled",
    subjectType: "event",
    subjectId: args.eventSlug,
  });
}

// spec §8.2: event_reminder/ticket_purchased have no real second-party
// actor — a reminder is time-triggered, and a purchase receipt's recipient
// IS the person who caused it (the buyer). createNotification's
// recipientId===actorId guard exists for like/comment-style "someone else
// did something to you" cases and would silently drop both of these, so
// they write directly rather than route through it. No dedup either (each
// purchase/reminder is independently meaningful, same posture as message).
async function createSystemEventNotification(args: {
  recipientId: string;
  type: "event_reminder" | "ticket_purchased";
  eventSlug: string;
}): Promise<void> {
  await db.notification.create({
    data: { recipientId: args.recipientId, actorId: null, type: args.type, subjectType: "event", subjectId: args.eventSlug },
  });
  publishToUsers([args.recipientId], { type: "notification" });

  // phase-15 spec §4.4: ticket_purchased/event_reminder are two of the
  // three deferrals this phase names explicitly (Phase 8 §8.3) — these
  // bypass createNotification entirely (see comment above), so they need
  // their own push dispatch rather than inheriting createNotification's.
  const { dispatchPushEvent } = await import("@/lib/push");
  await dispatchPushEvent({ recipientId: args.recipientId, type: args.type, subjectType: "event", subjectId: args.eventSlug });
}

export function notifyTicketPurchased(args: { recipientId: string; eventSlug: string }): Promise<void> {
  return createSystemEventNotification({ recipientId: args.recipientId, type: "ticket_purchased", eventSlug: args.eventSlug });
}

// No producer wired yet — event_reminder needs a scheduled-job mechanism
// this spec itself calls "an infra concern, not specified further here"
// (§8.2), same placement notifyCommunityInvite (Phase 3 §15) already
// occupies: schema/type ready, not built speculatively.
export function notifyEventReminder(args: { recipientId: string; eventSlug: string }): Promise<void> {
  return createSystemEventNotification({ recipientId: args.recipientId, type: "event_reminder", eventSlug: args.eventSlug });
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
      if (subjectType === "article") return "liked your article";
      if (subjectType === "wiki_page") return "liked your page";
      if (subjectType === "book") return "liked your book";
      if (subjectType === "published_file") return "liked your file";
      if (subjectType === "event") return "liked your event";
      return "liked your post";
    case "comment":
      if (subjectType === "project") return "commented on your project";
      if (subjectType === "article") return "commented on your article";
      if (subjectType === "wiki_page") return "commented on your page";
      if (subjectType === "book") return "commented on your book";
      if (subjectType === "published_file") return "commented on your file";
      if (subjectType === "event") return "commented on your event";
      return "replied to your post";
    case "mention":
      return "mentioned you";
    case "new_follower":
      return "followed you";
    case "follow_request":
      return "requested to follow you";
    case "follow_accepted":
      return "accepted your follow request";
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
    case "job_alert_match":
      return "A new job posting matches one of your job alerts";
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
    case "event_cancelled":
      return "cancelled an event you're attending";
    case "ticket_purchased":
      return "Your ticket purchase is confirmed";
    case "event_reminder":
      return "Reminder: an event you're attending starts soon";
    // phase-11 spec §4.3: sent on an upheld ModerationFlag outcome — actor
    // is always null (system-initiated), so GroupDescription's "Someone"
    // fallback reads as the platform, not a masked user.
    case "moderation_action":
      return "removed your content for violating community guidelines";
    // phase-12 spec §11 step 8: report_acknowledged/case_resolved/
    // appeal_decided are all system-initiated (actor always null, same as
    // moderation_action above).
    case "report_acknowledged":
      return "Your report has been reviewed";
    case "case_resolved":
      return "A Trust & Safety case involving you has been resolved";
    case "appeal_decided":
      return "Your appeal has been decided";
    case "org_member_added":
      return "added you to their organization";
    case "org_member_deactivated":
      return "removed your organization access";
    case "org_sso_configured":
      return "updated your organization's SSO settings";
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
      // phase-7: subjectId already encodes the full path for every subject
      // the generalized Reaction/Comment primitive covers — see
      // notifyReactionLike/Comment and reactions.ts's subject resolvers.
      if (
        n.subjectType === "article" ||
        n.subjectType === "wiki_page" ||
        n.subjectType === "book" ||
        n.subjectType === "published_file" ||
        n.subjectType === "event"
      ) {
        return `/${n.subjectId}`;
      }
      if (n.subjectType === "skill") {
        return n.actor?.username?.handle ? `/${n.actor.username.handle}` : "/feed";
      }
      return recipientHandle ? `/${recipientHandle}#post-${n.subjectId}` : "/feed";
    case "mention":
    case "new_follower":
    case "follow_request":
    case "follow_accepted":
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
    case "job_alert_match":
      return `/b/${n.subjectId}`;
    case "application_status":
      return `/b/${n.subjectId}`;
    case "appointment_request":
      return n.subjectType === "user" ? `/s/${n.subjectId}/monetization/services` : `/b/${n.subjectId}/appointments/manage`;
    case "appointment_confirmed":
    case "appointment_cancelled":
      return n.subjectType === "user" ? `/s/${n.subjectId}/monetization/services` : `/b/${n.subjectId}/appointments`;
    case "livestream_started":
      return `/live/${n.subjectId}`;
    case "event_cancelled":
    case "ticket_purchased":
    case "event_reminder":
      return `/e/${n.subjectId}`;
    // phase-12 spec §5/§11 step 8: routes to the one page a recipient can
    // actually act on either notification from — the appeals list
    // (/trust-safety) — rather than the report_acknowledged default below
    // (a reporter has nothing further to do, so that one keeps the
    // /notifications fallback).
    case "case_resolved":
    case "appeal_decided":
      return "/trust-safety";
    // phase-14 spec §10 step 8: subjectId is the organizationId for all
    // three org producers — routes to the org's own overview/directory
    // page, same "subjectId is whatever routing needs" precedent as
    // notifyNewFollower.
    case "org_member_added":
    case "org_member_deactivated":
    case "org_sso_configured":
      return `/org/${n.subjectId}`;
    default:
      return "/notifications";
  }
}
