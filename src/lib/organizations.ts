import "server-only";
import { db } from "@/lib/db";

// Plain server-only lib, not a "use server" action file — same reasoning as
// communities.ts: these trust a bare organizationId/userId with no
// request-level auth of their own. Callers (Server Components, Server
// Actions) are already authenticated via requireVerifiedUser/getCurrentUser.

export function getOrganizationMember(organizationId: string, userId: string) {
  return db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
}

export async function isActiveOrganizationMember(organizationId: string, userId: string): Promise<boolean> {
  const member = await getOrganizationMember(organizationId, userId);
  return member?.status === "active";
}

// Gates org admin console actions (team management, SSO config, audit log
// query) — same "active row required" bar as isActiveOrganizationMember,
// narrowed to the org_admin role.
export async function isOrgAdmin(organizationId: string, userId: string): Promise<boolean> {
  const member = await getOrganizationMember(organizationId, userId);
  return member?.role === "org_admin" && member?.status === "active";
}

// populates the "restrict to organization" picker on /c/new — every
// organization this user administers, mirrors getModeratedCommunities'
// (communities.ts) role for the same kind of picker.
export function getAdminOrganizations(userId: string) {
  return db.organization.findMany({
    where: { members: { some: { userId, role: "org_admin", status: "active" } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

// spec §7.1: the single choke point every org-admin-console write site
// calls through, mirroring the role logModAction plays for ModAction — so
// the audit log can't silently drift out of sync with the actions it's
// supposed to cover.
export function logOrgAudit(args: {
  organizationId: string;
  actorId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<unknown> {
  return db.organizationAuditLog.create({
    data: {
      organizationId: args.organizationId,
      actorId: args.actorId,
      action: args.action,
      targetType: args.targetType ?? null,
      targetId: args.targetId ?? null,
      metadataJson: args.metadata ? JSON.stringify(args.metadata) : null,
    },
  });
}

// spec §4.1: whether restrictedToOrganizationId (if set) is satisfied for
// this user — null means the community carries no organizational
// restriction at all. Used both at join-time (joinCommunity,
// communities.ts) and at content-view time (canViewRestrictedCommunity
// below) so the two checks can never drift apart.
export async function isEligibleForOrgRestrictedCommunity(
  restrictedToOrganizationId: string | null,
  userId: string | null
): Promise<boolean> {
  if (!restrictedToOrganizationId) return true;
  if (!userId) return false;
  return isActiveOrganizationMember(restrictedToOrganizationId, userId);
}

// spec §4.3 acceptance criterion: content-view gating must hold "regardless
// of the community's own visibility setting" — a `public`-visibility
// org-restricted community would otherwise leak content to non-employees,
// since the existing private-only gate never fires for it. Every content
// page that currently checks `visibility === "private"` folds this in too
// (see call sites across src/app/c/[slug]/**).
export function isGatedFromCommunityContent(
  community: { visibility: string; restrictedToOrganizationId: string | null },
  isActiveMember: boolean
): boolean {
  if (isActiveMember) return false;
  return community.visibility === "private" || community.restrictedToOrganizationId !== null;
}

// spec §4.2: deactivating an OrganizationMember must promptly (a) remove
// them from every community restricted to that organization and (b) revoke
// their SSO sessions for that org's connection — "not as a separate,
// easily-forgotten step." One transaction, so there's no window where a
// deactivated row exists but the cascade hasn't landed yet. Deliberately
// never touches Profile/posts/anything outside the organization's own
// scope (§4.2's other acceptance criterion) — nothing here references
// those tables.
export async function deactivateOrganizationMemberCascade(args: {
  organizationId: string;
  userId: string;
  actorId: string;
}): Promise<void> {
  const restrictedMemberships = await db.communityMember.findMany({
    where: { userId: args.userId, community: { restrictedToOrganizationId: args.organizationId } },
    select: { communityId: true, status: true },
  });

  const ssoConnection = await db.sSOConnection.findUnique({
    where: { organizationId: args.organizationId },
    select: { id: true },
  });

  // memberCount only counts active/muted rows (same accounting leaveCommunity
  // uses, communities.ts) — a still-pending join request never incremented
  // it, so removing that row shouldn't decrement it either.
  const countedCommunityIds = restrictedMemberships
    .filter((m) => m.status === "active" || m.status === "muted")
    .map((m) => m.communityId);

  await db.$transaction([
    db.organizationMember.update({
      where: { organizationId_userId: { organizationId: args.organizationId, userId: args.userId } },
      data: { status: "deactivated" },
    }),
    ...(restrictedMemberships.length > 0
      ? [
          db.communityMember.deleteMany({
            where: { userId: args.userId, community: { restrictedToOrganizationId: args.organizationId } },
          }),
        ]
      : []),
    ...countedCommunityIds.map((communityId) =>
      db.community.update({ where: { id: communityId }, data: { memberCount: { decrement: 1 } } })
    ),
    ...(ssoConnection
      ? [db.sSOIdentity.deleteMany({ where: { userId: args.userId, ssoConnectionId: ssoConnection.id } })]
      : []),
    db.organizationAuditLog.create({
      data: {
        organizationId: args.organizationId,
        actorId: args.actorId,
        action: "member_deactivated",
        targetType: "user",
        targetId: args.userId,
      },
    }),
  ]);
}
