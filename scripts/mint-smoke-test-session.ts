// Mints (or re-mints) a 30-day session token for the dedicated smoke-test
// account, for the optional authenticated check in scripts/smoke-test.mjs.
// Session tokens fixed-expire (session.ts SESSION_TTL_MS, 30 days, no
// sliding refresh), so this needs re-running roughly monthly — this script
// exists to make that a one-line copy-paste instead of code archaeology.
//
// Setup (one-time):
//   1. Sign up a real, dedicated, low-privilege account for this purpose —
//      this script does not create one.
//   2. Run this script against the target DB with that account's email:
//        DATABASE_URL=... DATABASE_AUTH_TOKEN=... \
//          SMOKE_TEST_EMAIL=smoke-test@example.com npx tsx scripts/mint-smoke-test-session.ts
//   3. Copy the printed token into the SMOKE_TEST_SESSION_TOKEN GitHub
//      Actions repo secret. Without it, smoke-test.mjs's authenticated
//      check is skipped (not failed) — see its comment.
//
// Re-run step 2-3 before the token expires (~30 days) to rotate it.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { randomBytes, createHash } from "crypto";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // matches src/lib/session.ts

async function main() {
  const email = process.env.SMOKE_TEST_EMAIL;
  if (!email) throw new Error("SMOKE_TEST_EMAIL is not set — which account should this mint a session for?");

  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const authToken = process.env.DATABASE_AUTH_TOKEN;
  const adapter = new PrismaLibSql({ url, authToken });
  const db = new PrismaClient({ adapter });

  try {
    const user = await db.user.findUnique({ where: { email }, select: { id: true, status: true } });
    if (!user) throw new Error(`No user found with email ${email} — sign up the smoke-test account first.`);
    if (user.status !== "active") throw new Error(`User ${email} has status "${user.status}", not "active".`);

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await db.session.create({
      data: { tokenHash, userId: user.id, expiresAt, userAgent: "smoke-test", ipAddress: null },
    });

    console.log(`\nSession minted for ${email}, expires ${expiresAt.toISOString()}.`);
    console.log(`Set this as the SMOKE_TEST_SESSION_TOKEN GitHub Actions secret:\n`);
    console.log(token);
    console.log();
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("[mint-smoke-test-session] failed:", err);
  process.exitCode = 1;
});
