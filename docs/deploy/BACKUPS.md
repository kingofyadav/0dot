# Database backups

Two separate scripts, for two separate `DATABASE_URL` shapes:

- **Local dev** (`DATABASE_URL=file:./dev.db`) — `scripts/backup-db.mjs`,
  a hot backup via `better-sqlite3`'s native backup API, written to disk
  under `./backups`.
- **Production/preview** (`DATABASE_URL=libsql://...`, remote Turso) —
  `scripts/backup-remote-db.mjs`, described below. This is the one that
  matters for prod — there is no local disk to snapshot for a remote DB.

## Remote (Turso) backups

```bash
node scripts/backup-remote-db.mjs
# or: npm run backup:remote
```

Shells out to the [Turso CLI](https://docs.turso.tech/cli/installation)
(`turso db shell "<DATABASE_URL>?authToken=<DATABASE_AUTH_TOKEN>" ".dump"`)
— a direct replica-URL connection using the database's own auth token, not
`turso db shell <database-name>`, so it never depends on an interactive
`turso auth login` session existing. The resulting SQL dump is uploaded to
Vercel Blob as a **private** object (`backups/<label>-<timestamp>.sql`) —
private, because a dump contains full user PII and must not be reachable
via a public Blob URL.

Env vars:

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Remote libsql/Turso URL (refuses `file:` URLs) |
| `DATABASE_AUTH_TOKEN` | yes | Turso database auth token for that URL |
| `BLOB_READ_WRITE_TOKEN` | yes | Same Vercel Blob token the app uses |
| `BACKUP_DB_LABEL` | no (default `db`) | Label used in the object name |
| `BACKUP_RETENTION_DAYS` | no (default `30`) | Prune Blob backups older than this |

### Scheduling

`.github/workflows/backup.yml` runs this daily at 03:30 UTC (after the
native Vercel daily cron at 03:23) and on `workflow_dispatch`. It needs
three **GitHub Actions repo secrets** (Settings → Secrets and variables →
Actions) — copy the values straight from the Vercel Production environment,
they are not created by the workflow:

- `DATABASE_URL`
- `DATABASE_AUTH_TOKEN`
- `BLOB_READ_WRITE_TOKEN`

Trigger a manual run any time from the Actions tab (`workflow_dispatch`) to
sanity-check the pipeline or take an ad-hoc backup before a risky change.

## Restoring

There is no one-command restore — pick the path that fits the situation:

- **Spin up a scratch DB to inspect/verify a backup** (recommended before
  ever relying on this for real): download the dump from Blob, then
  `turso db shell <new-scratch-db-name> < dump.sql` after `turso db create
  <new-scratch-db-name>`, or import into a local SQLite file with
  `sqlite3 restored.db < dump.sql` and point a local `DATABASE_URL=file:./restored.db`
  at it to boot the app against it.
- **Actually replace production** (only during a real incident, and only
  after the above verification step): create a new Turso database from the
  dump, cut `DATABASE_URL`/`DATABASE_AUTH_TOKEN` over to it in Vercel, and
  redeploy. Treat the previous (broken) database as evidence — don't
  destroy it until the incident is closed.

**Run the scratch-DB restore drill at least once** — either now, or before
the first time this backup is actually needed for real — so "restore
works" is a verified fact, not an assumption. As of 2026-09, this has not
yet been done end-to-end against a real production dump.
