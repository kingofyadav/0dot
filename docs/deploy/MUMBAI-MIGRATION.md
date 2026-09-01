# Moving the app to Mumbai (`bom1` + Turso `aws-ap-south-1`)

Functions and the Turso primary are both in US‑East (`iad1` /
`aws-us-east-1`), while the users and the operator are in India — every
dynamic request pays a ~230 ms trans‑Pacific round trip, and each DB query
inside that request pays it again. This runbook moves both to Mumbai.

**Order matters: migrate the database first.** If the functions move to
`bom1` while the DB is still in US‑East, every request gets *slower* (Mumbai
→ Virginia per query). (It still works — it's a latency regression, not an
outage — so the ordering is a preference, not a hard requirement.)

Nothing here needs a paid plan — Vercel Hobby allows one function region,
and Turso Starter allows a second group + 3 locations.

---

## Steps 1–4 (Turso side) — DONE 2026‑09‑01

The Mumbai database already exists and is a verified byte‑for‑byte copy of
production. What was run:

```bash
# backup (kept at ~/0dot-backups/0dot-prod-2026-09-01-2244.sql)
turso db shell 0dot-app-us-restore ".dump" > ~/0dot-backups/0dot-prod-<ts>.sql

# NOTE: the location ID is 'aws-ap-south-1', not 'bom'
turso group create mumbai --location aws-ap-south-1 --wait

# --from-db does NOT work across groups ("record not found") — create empty,
# then load the dump over stdin
turso db create 0dot-app-in --group mumbai --wait
turso db shell 0dot-app-in < ~/0dot-backups/0dot-prod-<ts>.sql

# verified: diff of `.dump` from both DBs is empty (168 tables, 230 inserts,
# identical _prisma_migrations list)
turso db tokens create 0dot-app-in
```

New DB: `libsql://0dot-app-in-kingofyadav.aws-ap-south-1.turso.io`

**If more than a little time passes before the cutover**, re‑sync so writes
that landed on prod in the meantime aren't lost:

```bash
turso db destroy 0dot-app-in --yes
turso db shell 0dot-app-us-restore ".dump" > ~/0dot-backups/0dot-prod-<ts>.sql
turso db create 0dot-app-in --group mumbai --wait
turso db shell 0dot-app-in < ~/0dot-backups/0dot-prod-<ts>.sql
turso db tokens create 0dot-app-in
```

## 5. Switch Vercel over

1. Update **Production** env vars — Vercel dashboard → project `0dot` →
   Settings → Environment Variables (the CLI here isn't authorized for this
   project, so it's the dashboard):
   - `DATABASE_URL` → `libsql://0dot-app-in-kingofyadav.aws-ap-south-1.turso.io`
   - `DATABASE_AUTH_TOKEN` → the token minted in step 4
2. The `"regions": ["bom1"]` pin in `vercel.json` ships in the PR that
   contains this doc.
3. **Merge that PR** — the merge deploy is the cutover: it picks up the new
   env vars *and* the region pin in one go.
   `scripts/migrate-deploy.mjs` runs against the new URL during the build —
   expect **"No pending migrations."** If it tries to apply migrations, the
   `_prisma_migrations` copy was incomplete: stop, roll back the env vars,
   re‑check.
4. Smoke‑test against the deployment:
   ```bash
   npm run smoke-test              # if it accepts a base URL; else do it by hand
   ```
   Log in, load `/feed`, create a post, open `/wallet` and confirm the
   balance, check `curl -sI https://0dot.in/ | grep -i x-vercel-id`
   now shows `bom1` execution.

## 6. Aftercare

- Leave `0dot-app-us-restore` **untouched** for ~1 week as the rollback
  target. Rollback = revert the two env vars + `vercel.json`, redeploy.
- After the week: `turso db destroy 0dot-app-us-restore` and update the
  `prod-turso-db-name` note.
- `scripts/backup-db.mjs` only handles `file:` URLs — for the remote DB,
  schedule `turso db shell 0dot-app-in ".dump"` somewhere instead (a daily
  GitHub Action or the existing daily cron writing to Blob).

## Expected result

- Every route (the app is dynamically rendered — feed, profile, messages,
  settings, **and** the landing page): ~230 ms faster per request for India
  users, and multi‑query pages improve by a multiple of that since each
  query inside the request stops crossing the Pacific.
- Combined with the non‑blocking boot change (`src/instrumentation.ts`) and
  Fluid Compute instance reuse, a warm request should land in well under
  200 ms and a cold start in a few seconds instead of ~50.
