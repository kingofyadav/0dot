import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// Deletes a single account by handle or email. Relies on the schema's
// onDelete: Cascade on every direct User relation (Session, Post, Profile,
// etc.) to clean up dependents in one go — same as wipe-users.ts's blanket
// delete, just scoped to one row here instead of every table.
//
// Usage: HANDLE=qa_tester_phase2 npx tsx scripts/delete-user.ts
//    or: EMAIL=someone@example.com npx tsx scripts/delete-user.ts

async function main() {
  const handle = process.env.HANDLE?.trim().toLowerCase();
  const email = process.env.EMAIL?.trim().toLowerCase();
  if (!handle && !email) throw new Error("Set HANDLE=<username> or EMAIL=<email>");

  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  console.log(`Looking up account at: ${url}`);

  const adapter = new PrismaLibSql({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  const prisma = new PrismaClient({ adapter });
  try {
    const user = handle
      ? await prisma.username.findUnique({ where: { handle }, include: { user: true } }).then((u) => u?.user)
      : await prisma.user.findUnique({ where: { email: email! } });

    if (!user) throw new Error(`No account found for ${handle ? `handle "${handle}"` : `email "${email}"`}.`);

    console.log(`Deleting user ${user.id} (email=${user.email}, status=${user.status}, created=${user.createdAt.toISOString()})`);
    await prisma.user.delete({ where: { id: user.id } });
    console.log("Done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("FAILED:", err.message ?? err);
  process.exitCode = 1;
});
