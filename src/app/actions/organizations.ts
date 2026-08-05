"use server";

import { randomBytes } from "crypto";
import { resolveTxt } from "node:dns/promises";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { getOrganizationMember, isOrgAdmin, logOrgAudit, deactivateOrganizationMemberCascade } from "@/lib/organizations";
import { notifyOrgMemberAdded, notifyOrgMemberDeactivated, notifyOrgSsoConfigured } from "@/lib/notifications";
import type { ActionState } from "@/app/actions/auth";

const ROLE_VALUES = new Set(["org_admin", "member"]);
const PROTOCOL_VALUES = new Set(["saml2", "oidc"]);
const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
const DOMAIN_VERIFICATION_PREFIX = "0dot-domain-verify=";

// spec §2/§10 step 1: no dependency on Phase 4's Business existing —
// business linking, if any, happens separately (not built here: this
// spec's own out-of-scope list doesn't require a UI for it, and no call
// site needs one yet). Creating an Organization also creates its first
// OrganizationMember as org_admin, same "create both or neither" nested-
// create reasoning as createCommunity's owner row.
export async function createOrganization(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const name = String(formData.get("name") ?? "").trim();
  const domainRaw = String(formData.get("domain") ?? "").trim().toLowerCase();

  if (name.length < 1 || name.length > 100) {
    return { error: "Name must be 1-100 characters." };
  }
  if (domainRaw && !DOMAIN_PATTERN.test(domainRaw)) {
    return { error: "Enter a valid domain, e.g. acme.com." };
  }

  const domainVerificationToken = domainRaw ? randomBytes(16).toString("hex") : null;

  let organization;
  try {
    organization = await db.organization.create({
      data: {
        name,
        domain: domainRaw || null,
        domainVerificationToken,
        createdBy: user.id,
        members: { create: [{ userId: user.id, role: "org_admin", status: "active" }] },
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "An organization for that domain already exists." };
    }
    throw err;
  }

  await logOrgAudit({ organizationId: organization.id, actorId: user.id, action: "org_settings_changed", targetType: "organization", targetId: organization.id });

  redirect(`/org/${organization.id}/manage`);
}

// spec §2.2: standard DNS TXT domain-verification gate, checked against a
// real DNS lookup rather than a weak-signal shortcut — SSO enforcement
// (§2.3 acceptance criterion) and any future domain-based auto-matching
// both depend on this actually meaning something.
export async function verifyOrganizationDomain(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  const organization = await db.organization.findUnique({ where: { id: organizationId } });
  if (!organization) return { error: "Organization not found." };
  if (!(await isOrgAdmin(organizationId, user.id))) return { error: "Only an org admin can verify the domain." };
  if (!organization.domain || !organization.domainVerificationToken) {
    return { error: "Set a domain before verifying it." };
  }
  if (organization.domainVerifiedAt) return {};

  let records: string[][];
  try {
    records = await resolveTxt(organization.domain);
  } catch {
    return { error: "Couldn't read a TXT record for that domain yet. DNS changes can take time to propagate." };
  }

  const expected = `${DOMAIN_VERIFICATION_PREFIX}${organization.domainVerificationToken}`;
  const found = records.some((chunks) => chunks.join("") === expected);
  if (!found) {
    return { error: `TXT record not found. Add "${expected}" to ${organization.domain}'s DNS and try again.` };
  }

  await db.organization.update({ where: { id: organizationId }, data: { domainVerifiedAt: new Date() } });
  await logOrgAudit({ organizationId, actorId: user.id, action: "org_settings_changed", targetType: "organization", targetId: organizationId, metadata: { domainVerified: true } });

  revalidatePath(`/org/${organizationId}/manage`);
  return {};
}

// spec §3: org_admin-only. Adds an *existing* 0dot user by email — this
// isn't JIT provisioning (that's sso.ts's job on first SSO login), just
// manual team management for someone who already has an account.
export async function addOrganizationMember(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const organizationId = String(formData.get("organizationId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const department = String(formData.get("department") ?? "").trim() || null;
  const title = String(formData.get("title") ?? "").trim() || null;

  if (!(await isOrgAdmin(organizationId, user.id))) return { error: "Only an org admin can add members." };

  const targetUser = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!targetUser) return { error: "No 0dot account exists with that email yet." };

  const existing = await getOrganizationMember(organizationId, targetUser.id);
  if (existing) {
    if (existing.status === "active") return { error: "That person is already a member." };
    await db.organizationMember.update({
      where: { organizationId_userId: { organizationId, userId: targetUser.id } },
      data: { status: "active", department, title },
    });
  } else {
    await db.organizationMember.create({
      data: { organizationId, userId: targetUser.id, role: "member", department, title },
    });
  }

  await logOrgAudit({ organizationId, actorId: user.id, action: "member_added", targetType: "user", targetId: targetUser.id });
  await notifyOrgMemberAdded({ recipientId: targetUser.id, actorId: user.id, organizationId });

  revalidatePath(`/org/${organizationId}/manage`);
  return {};
}

// org_admin-only. Role/department/title edits — deliberately can't touch
// status here (deactivateOrganizationMember below is the only path off
// "active," since that one carries the offboarding cascade with it).
export async function updateOrganizationMember(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const organizationId = String(formData.get("organizationId") ?? "");
  const targetUserId = String(formData.get("userId") ?? "");
  const roleRaw = String(formData.get("role") ?? "member");
  const department = String(formData.get("department") ?? "").trim() || null;
  const title = String(formData.get("title") ?? "").trim() || null;
  if (!organizationId || !targetUserId) return;
  if (!(await isOrgAdmin(organizationId, user.id))) return;

  const role = ROLE_VALUES.has(roleRaw) ? roleRaw : "member";
  const target = await getOrganizationMember(organizationId, targetUserId);
  if (!target || target.status !== "active") return;

  await db.organizationMember.update({
    where: { organizationId_userId: { organizationId, userId: targetUserId } },
    data: { role, department, title },
  });

  revalidatePath(`/org/${organizationId}/manage`);
}

// spec §4.2: the offboarding cascade — deactivation revokes org-restricted
// community access and SSO sessions in the same transaction, never touches
// the person's personal account/content. See
// deactivateOrganizationMemberCascade (organizations.ts) for the actual
// transaction.
export async function deactivateOrganizationMember(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const organizationId = String(formData.get("organizationId") ?? "");
  const targetUserId = String(formData.get("userId") ?? "");
  if (!organizationId || !targetUserId) return;
  if (!(await isOrgAdmin(organizationId, user.id))) return;

  const target = await getOrganizationMember(organizationId, targetUserId);
  if (!target || target.status !== "active") return;

  await deactivateOrganizationMemberCascade({ organizationId, userId: targetUserId, actorId: user.id });
  await notifyOrgMemberDeactivated({ recipientId: targetUserId, actorId: user.id, organizationId });

  revalidatePath(`/org/${organizationId}/manage`);
}

// spec §2.3 acceptance criterion: SSO enforcement can't be enabled for a
// domain that hasn't passed domainVerifiedAt — checked here at the one
// gate this codebase uses for the whole SSOConnection lifecycle
// (configuring it at all still requires a verified domain, tighter than
// the spec strictly requires, since an SSO connection with no verified
// domain has no safe way to resolve which org a given login belongs to).
export async function configureSsoConnection(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const organizationId = String(formData.get("organizationId") ?? "");
  const protocolRaw = String(formData.get("protocol") ?? "");
  const idpMetadataJson = String(formData.get("idpMetadataJson") ?? "").trim();

  const organization = await db.organization.findUnique({ where: { id: organizationId } });
  if (!organization) return { error: "Organization not found." };
  if (!(await isOrgAdmin(organizationId, user.id))) return { error: "Only an org admin can configure SSO." };
  if (!organization.domainVerifiedAt) return { error: "Verify the organization's domain before configuring SSO." };
  if (!PROTOCOL_VALUES.has(protocolRaw)) return { error: "Choose SAML 2.0 or OIDC." };

  try {
    JSON.parse(idpMetadataJson);
  } catch {
    return { error: "IdP metadata must be valid JSON." };
  }

  await db.sSOConnection.upsert({
    where: { organizationId },
    create: { organizationId, protocol: protocolRaw, idpMetadataJson },
    update: { protocol: protocolRaw, idpMetadataJson },
  });

  await logOrgAudit({ organizationId, actorId: user.id, action: "sso_connection_configured", targetType: "organization", targetId: organizationId });

  const admins = await db.organizationMember.findMany({
    where: { organizationId, role: "org_admin", status: "active", userId: { not: user.id } },
    select: { userId: true },
  });
  await Promise.all(admins.map((a) => notifyOrgSsoConfigured({ recipientId: a.userId, actorId: user.id, organizationId })));

  revalidatePath(`/org/${organizationId}/manage`);
  return {};
}

// spec §5.3: `enforced` only gates organization-scoped access (see
// requireOrgAccess-shaped checks wherever OrganizationMember status is
// checked) — it never touches auth.ts's ordinary login(), so it can never
// strand someone's personal account.
export async function setSsoEnforcement(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const organizationId = String(formData.get("organizationId") ?? "");
  const enforced = formData.get("enforced") === "on";
  if (!organizationId) return;
  if (!(await isOrgAdmin(organizationId, user.id))) return;

  const connection = await db.sSOConnection.findUnique({ where: { organizationId } });
  if (!connection) return;

  await db.sSOConnection.update({ where: { organizationId }, data: { enforced } });
  await logOrgAudit({
    organizationId,
    actorId: user.id,
    action: "sso_enforcement_changed",
    targetType: "organization",
    targetId: organizationId,
    metadata: { enforced },
  });

  revalidatePath(`/org/${organizationId}/manage`);
}
