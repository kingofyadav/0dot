import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// Removes the Organization(s) seed-organization.ts created, identified by
// name (its only marker — createdBy points at a real local account, not a
// seed one). Cascade (schema-level, same as every other relation off
// Organization) takes OrganizationMember rows with it.
//
// Usage: DATABASE_URL="file:./prisma/prod.db" npx tsx scripts/delete-seed-organization.ts
//    or: ORG_NAME="Acme Corp" npx tsx scripts/delete-seed-organization.ts

async function main() {
  const orgName = process.env.ORG_NAME ?? "0dot Seed Team";
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  console.log(`Deleting organization(s) named "${orgName}" at: ${url}`);

  const adapter = new PrismaLibSql({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  const prisma = new PrismaClient({ adapter });
  try {
    const { count } = await prisma.organization.deleteMany({ where: { name: orgName } });
    console.log(`Deleted ${count} organization(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("FAILED:", err.message ?? err);
  process.exitCode = 1;
});
