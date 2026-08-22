import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { ROLE_VALUES } from "../src/lib/platform-roles";

// One-time bootstrap for the very first PlatformRole row(s). Every
// subsequent grant should go through /admin/platform-roles (requires an
// existing super_admin — see requirePlatformRole in src/lib/auth-guards.ts),
// since that path has an audit trail (grantedBy) and this one doesn't.
//
// Usage: EMAIL=someone@example.com [ROLE=super_admin|admin|support] [PHONE=+91...] npx tsx scripts/grant-super-admin.ts

async function main() {
  const email = process.env.EMAIL?.trim().toLowerCase();
  if (!email) throw new Error("Set EMAIL=someone@example.com");
  const role = process.env.ROLE?.trim() || "super_admin";
  if (!ROLE_VALUES.has(role)) throw new Error(`ROLE must be one of: ${[...ROLE_VALUES].join(", ")}`);
  const phone = process.env.PHONE?.trim();

  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  console.log(`Granting ${role} to "${email}" at: ${url}`);

  const adapter = new PrismaLibSql({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  const prisma = new PrismaClient({ adapter });
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
    if (!user) throw new Error(`No 0dot account exists with email "${email}" yet — they must sign up first.`);

    const granted = await prisma.platformRole.upsert({
      where: { userId: user.id },
      create: { userId: user.id, role, grantedBy: null },
      update: { role, grantedBy: null, grantedAt: new Date() },
    });
    console.log(`Done: ${user.email} (${user.id}) is now ${role} (grantedAt: ${granted.grantedAt.toISOString()})`);

    if (phone) {
      await prisma.user.update({ where: { id: user.id }, data: { phone } });
      console.log(`Also set phone to ${phone}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("FAILED:", err.message ?? err);
  process.exitCode = 1;
});
