import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/session";

let counter = 0;
function unique(prefix: string) {
  counter += 1;
  return `${prefix}${counter}-${randomUUID().slice(0, 8)}`;
}

export async function createUser(overrides: Partial<{ status: string; email: string; passwordHash: string }> = {}) {
  const email = overrides.email ?? `${unique("user")}@example.com`;
  const user = await db.user.create({
    data: {
      email,
      passwordHash: overrides.passwordHash ?? (await bcrypt.hash("correct-horse-battery-staple", 4)),
      status: overrides.status ?? "active",
      emailVerifiedAt: new Date(),
      username: { create: { handle: unique("handle") } },
      profile: { create: { displayName: unique("Name") } },
    },
    include: { username: true, profile: true },
  });
  return user;
}

export async function createCommunity(overrides: Partial<{ visibility: string; creatorId: string }> = {}) {
  const creatorId = overrides.creatorId ?? (await createUser()).id;
  return db.community.create({
    data: {
      slug: unique("community"),
      name: unique("Community"),
      visibility: overrides.visibility ?? "public",
      createdBy: creatorId,
    },
  });
}

export async function addCommunityMember(communityId: string, userId: string, overrides: Partial<{ role: string; status: string }> = {}) {
  return db.communityMember.create({
    data: {
      communityId,
      userId,
      role: overrides.role ?? "member",
      status: overrides.status ?? "active",
    },
  });
}

export async function createPost(overrides: Partial<{ authorId: string; body: string; communityId: string; businessAuthorId: string }> = {}) {
  const authorId = overrides.authorId ?? (await createUser()).id;
  return db.post.create({
    data: {
      authorId,
      body: overrides.body ?? unique("post body "),
      communityId: overrides.communityId,
      businessAuthorId: overrides.businessAuthorId,
    },
  });
}

export async function createBusiness(overrides: Partial<{ status: string; creatorId: string }> = {}) {
  const creatorId = overrides.creatorId ?? (await createUser()).id;
  return db.business.create({
    data: {
      slug: unique("business"),
      name: unique("Business"),
      category: "other",
      status: overrides.status ?? "pending",
      createdBy: creatorId,
    },
  });
}

export async function blockUser(blockerId: string, blockedId: string) {
  return db.block.create({ data: { blockerId, blockedId } });
}

// Returns the raw token (as if it were the session cookie's value) — the
// DB row only ever stores its hash, matching session.ts's createSession.
export async function createSessionForUser(userId: string) {
  const token = randomUUID();
  await db.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  return token;
}
