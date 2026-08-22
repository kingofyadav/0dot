import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// Read-only account review — local or Turso, selected via DATABASE_URL.
// Usage: npx tsx scripts/review-users.ts
//    or: DATABASE_URL="$TURSO_DATABASE_URL" DATABASE_AUTH_TOKEN="$TURSO_AUTH_TOKEN" npx tsx scripts/review-users.ts

async function main() {
  const url = process.env.DATABASE_URL ?? "file:./prisma/prod.db";
  console.log(`Reviewing accounts at: ${url}\n`);

  const adapter = new PrismaLibSql({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  const prisma = new PrismaClient({ adapter });
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        phone: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        username: { select: { handle: true } },
        platformRole: { select: { role: true, grantedAt: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    console.log(`${users.length} account(s):\n`);
    for (const u of users) {
      const handle = u.username?.handle ? `@${u.username.handle}` : "(no username)";
      const role = u.platformRole ? `platformRole=${u.platformRole.role}` : "platformRole=none";
      console.log(
        `${handle.padEnd(20)} ${u.email.padEnd(35)} status=${u.status.padEnd(11)} verified=${!!u.emailVerifiedAt} ${role} created=${u.createdAt.toISOString()}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("FAILED:", err.message ?? err);
  process.exitCode = 1;
});
