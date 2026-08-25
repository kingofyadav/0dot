import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const url = process.env.DATABASE_URL ?? "file:./dev.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;

// DATABASE_URL is external config with no compile-time guarantee it's
// right — a malformed or wrong-but-valid-looking value here has twice
// silently pointed the app at an empty/wrong database instead of failing
// loudly. Fail fast and log which host we're actually using so this is
// visible in runtime logs instead of only discoverable by hand.
if (!url.startsWith("file:") && !url.startsWith("libsql:")) {
  throw new Error(
    `DATABASE_URL is not a valid file: or libsql: URL (got ${JSON.stringify(url)}). ` +
      `Check the Production environment variable in Vercel.`
  );
}
if (url.startsWith("libsql:") && !authToken) {
  throw new Error("DATABASE_URL is a remote libsql: URL but DATABASE_AUTH_TOKEN is not set.");
}
console.log(`[db] connecting to ${url.startsWith("file:") ? url : new URL(url).host}`);

const adapter = new PrismaLibSql({ url, authToken });

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
