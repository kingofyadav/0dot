#!/usr/bin/env node
// Hot backup of the production SQLite DB, safe to run while the app is
// serving traffic — uses better-sqlite3's native backup API (SQLite's
// official online-backup mechanism), not a raw file copy, which could
// otherwise capture a torn snapshot mid-write regardless of journal mode.
//
// Usage: node scripts/backup-db.mjs
// Env:
//   DATABASE_URL             same "file:./path.db" value the app uses (default file:./dev.db)
//   BACKUP_DIR                where backups are written (default ./backups)
//   BACKUP_RETENTION_DAYS      delete backups older than this many days (default 14)
//
// Intended to run on a schedule (cron/systemd timer) on the VPS hosting the
// app — see docs/deploy/BACKUPS.md for the timer setup.

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

function resolveDbPath() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const prefix = "file:";
  if (!url.startsWith(prefix)) {
    throw new Error(`Only file: DATABASE_URL values are backed up by this script, got: ${url}`);
  }
  return path.resolve(process.cwd(), url.slice(prefix.length));
}

async function main() {
  const dbPath = resolveDbPath();
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found: ${dbPath}`);
  }

  const backupDir = path.resolve(process.cwd(), process.env.BACKUP_DIR ?? "./backups");
  fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destPath = path.join(backupDir, `${path.basename(dbPath)}.${timestamp}.bak`);

  const db = new Database(dbPath, { readonly: true });
  try {
    await db.backup(destPath);
  } finally {
    db.close();
  }
  console.log(`[backup-db] wrote ${destPath}`);

  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 14);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const entry of fs.readdirSync(backupDir)) {
    const entryPath = path.join(backupDir, entry);
    const stat = fs.statSync(entryPath);
    if (stat.isFile() && stat.mtimeMs < cutoff) {
      fs.unlinkSync(entryPath);
      console.log(`[backup-db] pruned ${entryPath} (older than ${retentionDays}d)`);
    }
  }
}

main().catch((err) => {
  console.error("[backup-db] failed:", err);
  process.exitCode = 1;
});
