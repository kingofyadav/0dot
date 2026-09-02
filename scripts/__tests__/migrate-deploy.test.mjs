// Regression test for the 2026-08-31 cascade-delete incident referenced in
// scripts/migrate-deploy.mjs's applyMigrationSql comment: a Prisma
// "RedefineTables" migration (drop+recreate a table, guarded by `PRAGMA
// foreign_keys=OFF`) silently cascade-deleted child rows when applied
// inside a transaction, because that PRAGMA is a no-op mid-transaction.
//
// Reproduces the exact shape of that migration against a scratch SQLite
// file (independent of the shared vitest test DB — this never touches
// TEST_DATABASE_URL) and asserts:
//   1. applyMigrationSql (the real dispatch logic) preserves the child row.
//   2. Naively wrapping the same SQL in one transaction — the bug's actual
//      mechanism — really does lose it, proving the dispatch is load-bearing
//      and not just incidentally correct.
import { describe, it, expect, afterEach } from "vitest";
import { createClient } from "@libsql/client";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { applyMigrationSql, splitStatements } from "../migrate-deploy.mjs";

// Mirrors Prisma's actual "RedefineTables" output shape for a rebuild of
// `parent` (e.g. a column type change) with a child row referencing it via
// ON DELETE CASCADE — same pattern as User -> Session/Username/Profile/
// LedgerAccount in the real schema.
const REDEFINE_TABLES_SQL = `
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_parent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);
INSERT INTO "new_parent" ("id", "name") SELECT "id", "name" FROM "parent";
DROP TABLE "parent";
ALTER TABLE "new_parent" RENAME TO "parent";
PRAGMA foreign_keys=ON;
`;

async function makeScratchDb() {
  const dir = await mkdtemp(path.join(tmpdir(), "migrate-deploy-test-"));
  const dbPath = path.join(dir, "scratch.db");
  const client = createClient({ url: `file:${dbPath}` });
  // SQLite disables FK enforcement per-connection by default — must be
  // explicit, same as any real libsql/Turso connection this script targets.
  await client.execute("PRAGMA foreign_keys = ON;");
  await client.batch(
    [
      `CREATE TABLE parent (id TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL)`,
      `CREATE TABLE child (id TEXT NOT NULL PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parent(id) ON DELETE CASCADE)`,
      `INSERT INTO parent (id, name) VALUES ('p1', 'original')`,
      `INSERT INTO child (id, parent_id) VALUES ('c1', 'p1')`,
    ],
    "write"
  );
  return { client, dir };
}

let cleanupDirs = [];
afterEach(async () => {
  await Promise.all(cleanupDirs.map((d) => rm(d, { recursive: true, force: true })));
  cleanupDirs = [];
});

describe("migrate-deploy.mjs applyMigrationSql", () => {
  it("preserves child rows across a RedefineTables migration (executeMultiple path)", async () => {
    const { client, dir } = await makeScratchDb();
    cleanupDirs.push(dir);

    await applyMigrationSql(client, REDEFINE_TABLES_SQL);

    const { rows } = await client.execute("SELECT id FROM child WHERE id = 'c1'");
    expect(rows).toHaveLength(1);
  });

  it("demonstrates the actual bug: the same SQL wrapped in one transaction loses the child row", async () => {
    const { client, dir } = await makeScratchDb();
    cleanupDirs.push(dir);

    // What applyMigrationSql deliberately avoids for this SQL shape —
    // batch() implicitly wraps every statement in one transaction, so the
    // `PRAGMA foreign_keys=OFF` lines are no-ops and the DROP TABLE cascade
    // -deletes `child` for real.
    await client.batch(splitStatements(REDEFINE_TABLES_SQL), "write");

    const { rows } = await client.execute("SELECT id FROM child WHERE id = 'c1'");
    expect(rows).toHaveLength(0);
  });
});
