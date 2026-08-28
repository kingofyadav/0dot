#!/usr/bin/env node
// `prisma migrate deploy` cannot run against this app's production
// DATABASE_URL: Prisma's migrate engine only understands `file:` SQLite
// URLs, and production is a remote libsql/Turso URL (P1013: "the scheme is
// not recognized"). db.ts already talks to that same URL at runtime via
// @prisma/adapter-libsql/@libsql/client, so this applies pending
// prisma/migrations/*/migration.sql files the same way, over the libsql
// wire protocol, recording them in a Prisma-shaped _prisma_migrations table
// so `prisma migrate status` (run against a local file: copy) stays legible.
//
// Usage: DATABASE_URL=libsql://... node scripts/migrate-deploy.mjs
// Local file: DATABASE_URLs are refused — use `prisma migrate deploy` for
// those instead, which handles them natively.
import { createClient } from "@libsql/client";
import { randomUUID } from "crypto";
import { readFileSync, readdirSync } from "fs";
import path from "path";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "prisma/migrations");

function splitStatements(sql) {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  // Vercel sets VERCEL_ENV to "production"/"preview"/"development" during
  // every build. Production and Preview each now have their OWN isolated
  // Turso database (0dot-app-us / 0dot-app-preview), so applying pending
  // migrations on a preview build is safe — it can no longer touch prod
  // data, which was the original reason this used to skip everything but
  // production. Development-target deploys still skip (rare, and the dev DB
  // is migrated by hand via `npm run migrate:deploy` when needed). Absent
  // VERCEL_ENV entirely (a manual local run), proceed.
  //
  // Concurrent preview builds from different PRs race on the same preview
  // DB — the _prisma_migrations check + transactional batch below make a
  // collision fail one build (retry it) rather than corrupt anything; a
  // per-DB advisory lock would be the fix if that ever becomes common.
  if (process.env.VERCEL_ENV === "development") {
    console.log("Skipping migrations: VERCEL_ENV=development.");
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (url.startsWith("file:")) {
    throw new Error(
      "DATABASE_URL is a local file: URL — use `prisma migrate deploy` for that, not this script (which is only for remote libsql/Turso URLs)."
    );
  }

  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });

  await client.execute(`
    CREATE TABLE IF NOT EXISTS _prisma_migrations (
      id                    TEXT PRIMARY KEY NOT NULL,
      checksum              TEXT NOT NULL,
      finished_at           DATETIME,
      migration_name        TEXT NOT NULL,
      logs                  TEXT,
      rolled_back_at        DATETIME,
      started_at            DATETIME NOT NULL DEFAULT current_timestamp,
      applied_steps_count   INTEGER UNSIGNED NOT NULL DEFAULT 0
    )
  `);

  const { rows } = await client.execute(
    "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL"
  );
  const applied = new Set(rows.map((r) => r.migration_name));

  const pending = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .filter((name) => !applied.has(name));

  if (pending.length === 0) {
    console.log("No pending migrations.");
    return;
  }

  for (const name of pending) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
    const statements = splitStatements(sql);

    console.log(`Applying ${name} (${statements.length} statement(s))...`);
    // client.batch runs all statements in one transaction — a mid-migration
    // failure (e.g. the payment-idempotency migration's unique index
    // rejecting pre-existing duplicate rows) leaves nothing partially
    // applied.
    await client.batch(statements, "write");

    await client.execute({
      sql: `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
            VALUES (?, 'applied-via-migrate-deploy.mjs', datetime('now'), ?, datetime('now'), ?)`,
      args: [randomUUID(), name, statements.length],
    });
    console.log(`  done.`);
  }

  console.log(`Applied ${pending.length} migration(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
