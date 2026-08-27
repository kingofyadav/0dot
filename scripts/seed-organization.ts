import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// Groups seeded accounts (seed-users.ts, @seed.0dot.local domain) into one
// Organization ("team") so you can click around the org/manage/audit-log
// pages against realistic member counts. Mirrors what createOrganization()
// in src/app/actions/organizations.ts does — Organization row + its first
// OrganizationMember (org_admin) created together — then bulk-adds the rest
// as plain members, same shape addOrganizationMember() would leave behind.
//
// Usage: DATABASE_URL="file:./prisma/prod.db" ADMIN_HANDLE=sahul npx tsx scripts/seed-organization.ts
//    or: ORG_NAME="Acme Corp" MEMBERS=25 npx tsx scripts/seed-organization.ts

const SEED_EMAIL_DOMAIN = "seed.0dot.local";

const DEPARTMENTS = ["Engineering", "Design", "Product", "Sales", "Marketing", "Support", "Ops", "Finance"];
const TITLES = ["Associate", "Senior Associate", "Lead", "Manager", "Director", "Specialist", "Analyst"];

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function pick<T>(arr: T[]): T {
  return arr[randomInt(arr.length)];
}

async function main() {
  const adminHandle = (process.env.ADMIN_HANDLE ?? "sahul").trim().toLowerCase();
  const orgName = process.env.ORG_NAME ?? "0dot Seed Team";
  const memberCap = Number(process.env.MEMBERS ?? 99);
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  console.log(`Creating organization "${orgName}" at: ${url}`);

  const adapter = new PrismaLibSql({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  const prisma = new PrismaClient({ adapter });

  try {
    const admin = await prisma.username.findUnique({ where: { handle: adminHandle }, include: { user: true } }).then((u) => u?.user);
    if (!admin) throw new Error(`No account found for handle "${adminHandle}" — set ADMIN_HANDLE to an existing local account.`);

    const seedUsers = await prisma.user.findMany({
      where: { email: { endsWith: `@${SEED_EMAIL_DOMAIN}` }, id: { not: admin.id } },
      select: { id: true },
      take: memberCap,
    });
    if (seedUsers.length === 0) throw new Error(`No @${SEED_EMAIL_DOMAIN} accounts found — run seed-users.ts first.`);

    const organization = await prisma.organization.create({
      data: {
        name: orgName,
        createdBy: admin.id,
        members: { create: [{ userId: admin.id, role: "org_admin", status: "active" }] },
      },
    });
    console.log(`Created organization ${organization.id}, admin=${adminHandle}.`);

    await prisma.organizationMember.createMany({
      data: seedUsers.map((u) => ({
        organizationId: organization.id,
        userId: u.id,
        role: "member",
        department: pick(DEPARTMENTS),
        title: pick(TITLES),
      })),
    });
    console.log(`Added ${seedUsers.length} member(s). Total headcount: ${seedUsers.length + 1}.`);
    console.log(`Manage at: /org/${organization.id}/manage (as ${adminHandle})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("FAILED:", err.message ?? err);
  process.exitCode = 1;
});
