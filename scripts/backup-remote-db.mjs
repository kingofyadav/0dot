#!/usr/bin/env node
// Backs up the production/preview Turso DB — the remote-DB counterpart to
// backup-db.mjs, which only handles local file: SQLite (see its header
// comment). Production is a remote libsql/Turso URL with no local disk to
// snapshot, so this shells out to the Turso CLI's ".dump" (the same command
// that was previously only ever run by hand — see docs/deploy/BACKUPS.md)
// and uploads the resulting SQL dump to Vercel Blob as a private object, so
// it lands somewhere durable and off the DB's own infrastructure.
//
// Usage: node scripts/backup-remote-db.mjs
// Requires the `turso` CLI on PATH (https://docs.turso.tech/cli/installation
// — `curl -sSfL https://get.tur.so/install.sh | bash`).
//
// Env:
//   DATABASE_URL          remote libsql/Turso URL (file: URLs are refused —
//                          use backup-db.mjs for local dev instead)
//   DATABASE_AUTH_TOKEN   Turso database auth token for that URL
//   BLOB_READ_WRITE_TOKEN Vercel Blob token (same one the app uses)
//   BACKUP_DB_LABEL        short label used in the object name (default "db")
//   BACKUP_RETENTION_DAYS  prune Blob backups older than this (default 30)
//
// The CLI is invoked as `turso db shell "<url>?authToken=..." ".dump"` —
// a direct replica-URL connection, not `turso db shell <database-name>`,
// so this never depends on an interactive `turso auth login` session
// existing in CI; the database's own auth token is sufficient.

import { spawn } from "child_process";
import { createWriteStream, createReadStream } from "fs";
import { mkdtemp, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { put, list, del } from "@vercel/blob";

function resolveDumpTarget() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (url.startsWith("file:")) {
    throw new Error(
      "DATABASE_URL is a local file: URL — use `node scripts/backup-db.mjs` for that, not this script (which is only for remote libsql/Turso URLs)."
    );
  }
  const authToken = process.env.DATABASE_AUTH_TOKEN;
  if (!authToken) throw new Error("DATABASE_AUTH_TOKEN is not set");

  const target = new URL(url);
  target.searchParams.set("authToken", authToken);
  return target.toString();
}

async function dumpToFile(dumpTarget, destPath) {
  await new Promise((resolve, reject) => {
    const out = createWriteStream(destPath);
    const child = spawn("turso", ["db", "shell", dumpTarget, ".dump"], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    child.stdout.pipe(out);
    child.on("error", (err) =>
      reject(new Error(`Failed to launch turso CLI — is it installed and on PATH? (${err.message})`))
    );
    child.on("close", (code) => {
      out.close();
      if (code !== 0) reject(new Error(`turso db shell exited with code ${code}`));
      else resolve();
    });
  });
}

async function pruneOldBackups(prefix, retentionDays) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let cursor;
  let pruned = 0;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    const stale = page.blobs.filter((b) => b.uploadedAt.getTime() < cutoff);
    if (stale.length > 0) {
      await del(stale.map((b) => b.url));
      pruned += stale.length;
    }
    cursor = page.cursor;
  } while (cursor);
  return pruned;
}

async function main() {
  const dumpTarget = resolveDumpTarget();
  const label = process.env.BACKUP_DB_LABEL ?? "db";
  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);

  const workDir = await mkdtemp(path.join(tmpdir(), "0dot-backup-"));
  const dumpPath = path.join(workDir, "dump.sql");

  try {
    console.log("[backup-remote-db] dumping via turso db shell...");
    await dumpToFile(dumpTarget, dumpPath);

    const { size } = await stat(dumpPath);
    if (size === 0) throw new Error("Dump produced an empty file — refusing to upload/treat as a successful backup.");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const pathname = `backups/${label}-${timestamp}.sql`;

    console.log(`[backup-remote-db] uploading ${pathname} (${(size / 1024 / 1024).toFixed(2)} MB)...`);
    const blob = await put(pathname, createReadStream(dumpPath), {
      access: "private",
      addRandomSuffix: false,
    });
    console.log(`[backup-remote-db] wrote ${blob.pathname}`);

    const pruned = await pruneOldBackups("backups/", retentionDays);
    if (pruned > 0) console.log(`[backup-remote-db] pruned ${pruned} backup(s) older than ${retentionDays}d`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("[backup-remote-db] failed:", err);
  process.exitCode = 1;
});
