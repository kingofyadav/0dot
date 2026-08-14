import { createClient } from "@libsql/client";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

// TEMPORARY ops endpoint (2026-08-14): applies pending prisma/migrations/*
// directly via @libsql/client, since the Prisma 7.9.1 CLI's migrate engine
// has no driver-adapter support and can't speak this project's libsql://
// Turso connection (only the Client, via src/lib/db.ts's PrismaLibSql
// adapter, can) — and MIGRATION_RUNNER_SECRET only resolves to a real
// value at Function runtime, not via `vercel env pull` or the build step.
// Remove this route once the production schema is caught up.
const migrationsDir = path.join(process.cwd(), "prisma", "migrations");

function isAuthorized(request: Request): boolean {
  const expected = process.env.MIGRATION_RUNNER_SECRET;
  if (!expected) return false;
  const provided = request.headers.get("x-migration-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }

  const client = createClient({
    url: process.env.DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  const log: string[] = [];

  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "checksum" TEXT NOT NULL,
        "finished_at" DATETIME,
        "migration_name" TEXT NOT NULL,
        "logs" TEXT,
        "rolled_back_at" DATETIME,
        "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
        "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
      )
    `);

    const appliedRes = await client.execute(
      `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
    );
    const applied = new Set(appliedRes.rows.map((r) => String(r.migration_name)));

    const migrationNames = readdirSync(migrationsDir)
      .filter((name) => statSync(path.join(migrationsDir, name)).isDirectory())
      .sort();
    const pending = migrationNames.filter((name) => !applied.has(name));

    log.push(`Pending: ${pending.join(", ") || "(none)"}`);

    for (const name of pending) {
      const sqlPath = path.join(migrationsDir, name, "migration.sql");
      const sql = readFileSync(sqlPath, "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const startedAt = new Date().toISOString();

      await client.executeMultiple(sql);
      await client.execute({
        sql: `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES (?, ?, current_timestamp, ?, NULL, NULL, ?, 1)`,
        args: [randomUUID(), checksum, name, startedAt],
      });
      log.push(`Applied ${name}`);
    }

    client.close();
    return NextResponse.json({ ok: true, log });
  } catch (err) {
    client.close();
    return NextResponse.json(
      { ok: false, log, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
