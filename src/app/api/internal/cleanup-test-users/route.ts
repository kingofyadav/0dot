import { createClient } from "@libsql/client";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

// TEMPORARY ops endpoint (2026-08-17): one-off wipe of test accounts from
// production ahead of the first real signup. Same reason as
// run-pending-migrations/route.ts — DATABASE_URL/DATABASE_AUTH_TOKEN are
// Sensitive and only resolve at Function runtime, not via `vercel env pull`.
// Remove this route once it's been called.
const SYSTEM_EMAIL = "platform-apps@0dot.internal";

function isAuthorized(request: Request): boolean {
  const expected = process.env.CLEANUP_SECRET ?? process.env.MIGRATION_RUNNER_SECRET;
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
  await client.execute("PRAGMA foreign_keys = ON;");

  const before = await client.execute({
    sql: "SELECT id, email FROM User WHERE email != ?",
    args: [SYSTEM_EMAIL],
  });

  const removed: string[] = [];
  const anonymized: string[] = [];

  for (const r of before.rows) {
    const id = String(r.id);
    const email = String(r.email);
    try {
      await client.execute({ sql: "DELETE FROM User WHERE id = ?", args: [id] });
      removed.push(email);
    } catch (err) {
      await client.execute({
        sql: `UPDATE User SET email = ?, phone = NULL, passwordHash = '', status = 'deleted', twoFactorSecret = NULL, twoFactorEnabledAt = NULL WHERE id = ?`,
        args: [`deleted-${id}@0dot.invalid`, id],
      });
      anonymized.push(`${email} (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  const after = await client.execute("SELECT id, email, isPlatformAdmin FROM User");
  const remaining = after.rows.map((r) => ({ id: r.id, email: r.email, isPlatformAdmin: r.isPlatformAdmin }));

  client.close();
  return NextResponse.json({ ok: true, removed, anonymized, remaining });
}
