import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// Removes every account seed-users.ts created (identified by its dedicated
// @seed.0dot.local email domain) so the batch can be regenerated from
// scratch — e.g. after tuning the name pool. Cascade (schema-level, same as
// every other User relation) takes Profile/Username/Post/Follow/etc. rows
// for these accounts with it.
//
// Usage: DATABASE_URL="file:./prisma/prod.db" npx tsx scripts/delete-seed-users.ts

const SEED_EMAIL_DOMAIN = "seed.0dot.local";

async function main() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  console.log(`Deleting @${SEED_EMAIL_DOMAIN} accounts at: ${url}`);

  const adapter = new PrismaLibSql({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  const prisma = new PrismaClient({ adapter });
  try {
    const { count } = await prisma.user.deleteMany({
      where: { email: { endsWith: `@${SEED_EMAIL_DOMAIN}` } },
    });
    console.log(`Deleted ${count} account(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exitCode = 1;
});
