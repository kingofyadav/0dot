import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// Adds posts + a follow graph across the accounts seed-users.ts created
// (identified the same way: @seed.0dot.local email domain). Mirrors the two
// places this data is denormalized elsewhere in the app — Post.likeCount/
// replyCount/repostCount stay untouched (no likes/replies seeded here, so 0
// is correct) and Profile.followerCount/followingCount are set to match the
// Follow rows actually inserted, same as followUser() does transactionally
// in src/app/actions/follow.ts.
//
// Usage: DATABASE_URL="file:./prisma/prod.db" npx tsx scripts/seed-posts-follows.ts
//    or: POSTS_PER_USER_MAX=6 FOLLOWS_PER_USER_MAX=20 DATABASE_URL=... npx tsx scripts/seed-posts-follows.ts

const SEED_EMAIL_DOMAIN = "seed.0dot.local";

const POST_BODIES = [
  "Just shipped something I've been tinkering with all week. Feels good to finally hit publish.",
  "Anyone else spend way too long picking the perfect font for a side project?",
  "Coffee #{n} of the day. No regrets.",
  "Learned something new today and it completely changed how I think about my workflow.",
  "Rainy afternoon, good playlist, decent progress. Can't complain.",
  "Hot take: the best ideas show up in the shower, never at the desk.",
  "Finally got around to reorganizing my notes. Small win but it counts.",
  "If you had to recommend one book this year, what would it be?",
  "Weekend project turned into a whole rabbit hole. Worth it though.",
  "Grateful for the small stuff today — good weather, good food, good people.",
  "Trying a new routine this month. Ask me again in three weeks.",
  "Sometimes the simplest solution really is the right one.",
  "Deep in a debugging session and the bug turned out to be one character. Classic.",
  "Long walk, no phone, just thinking. Should do this more often.",
  "Excited to see where this year takes things. Big plans brewing.",
  "Unpopular opinion: plain text notes beat every fancy app I've tried.",
  "Caught a great sunset today and had to stop and just look at it for a minute.",
  "Working through a reading list that's way too ambitious, as usual.",
  "Small update: things are moving slower than planned but they're moving.",
  "Nothing beats a productive morning before everyone else wakes up.",
];

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function pick<T>(arr: T[]): T {
  return arr[randomInt(arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function main() {
  const postsPerUserMax = Number(process.env.POSTS_PER_USER_MAX ?? 4);
  const followsPerUserMax = Number(process.env.FOLLOWS_PER_USER_MAX ?? 15);
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  console.log(`Seeding posts + follows at: ${url}`);

  const adapter = new PrismaLibSql({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  const prisma = new PrismaClient({ adapter });

  try {
    const users = await prisma.user.findMany({
      where: { email: { endsWith: `@${SEED_EMAIL_DOMAIN}` } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    if (userIds.length === 0) throw new Error(`No @${SEED_EMAIL_DOMAIN} accounts found — run seed-users.ts first.`);
    console.log(`Found ${userIds.length} seeded accounts.`);

    // ---- Posts ----
    if (process.env.SKIP_POSTS === "1") {
      console.log("Skipping posts (SKIP_POSTS=1).");
    } else {
      const postRows: { authorId: string; body: string }[] = [];
      for (const id of userIds) {
        const n = 1 + randomInt(postsPerUserMax);
        for (let i = 0; i < n; i++) {
          const body = pick(POST_BODIES).replace("#{n}", String(1 + randomInt(4)));
          postRows.push({ authorId: id, body });
        }
      }
      await prisma.post.createMany({ data: postRows });
      console.log(`Created ${postRows.length} posts.`);
    }

    // ---- Follows ----
    const followPairs = new Set<string>();
    const followRows: { followerId: string; followeeId: string }[] = [];
    for (const followerId of userIds) {
      const n = 1 + randomInt(followsPerUserMax);
      const candidates = shuffle(userIds.filter((id) => id !== followerId)).slice(0, n);
      for (const followeeId of candidates) {
        const key = `${followerId}:${followeeId}`;
        if (followPairs.has(key)) continue;
        followPairs.add(key);
        followRows.push({ followerId, followeeId });
      }
    }
    // skipDuplicates isn't supported on SQLite by Prisma — followPairs above
    // already dedupes within this run, so a plain createMany is safe as long
    // as this script hasn't already been run against the same accounts.
    await prisma.follow.createMany({ data: followRows });
    console.log(`Created ${followRows.length} follow edges.`);

    // ---- Denormalized counts, same fields followUser() keeps in sync ----
    const followerCounts = new Map<string, number>();
    const followingCounts = new Map<string, number>();
    for (const { followerId, followeeId } of followRows) {
      followingCounts.set(followerId, (followingCounts.get(followerId) ?? 0) + 1);
      followerCounts.set(followeeId, (followerCounts.get(followeeId) ?? 0) + 1);
    }
    const affectedIds = new Set([...followerCounts.keys(), ...followingCounts.keys()]);
    await Promise.all(
      [...affectedIds].map((userId) =>
        prisma.profile.update({
          where: { userId },
          data: {
            followerCount: followerCounts.get(userId) ?? 0,
            followingCount: followingCounts.get(userId) ?? 0,
          },
        }),
      ),
    );
    console.log(`Updated follower/following counts on ${affectedIds.size} profiles.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exitCode = 1;
});
