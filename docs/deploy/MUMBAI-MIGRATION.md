# Moving the app to Mumbai (`bom1` + Turso `aws-ap-south-1`)

Functions and the Turso primary are both in US‑East (`iad1` /
`aws-us-east-1`), while the users and the operator are in India — every
dynamic request pays a ~230 ms trans‑Pacific round trip, and each DB query
inside that request pays it again. This runbook moves both to Mumbai.

**Order matters: migrate the database first.** If the functions move to
`bom1` while the DB is still in US‑East, every request gets *slower* (Mumbai
→ Virginia per query).

Nothing here needs a paid plan — Vercel Hobby allows one function region,
and Turso's free tier allows choosing the primary location.

---

## 0. Pre‑flight

- `turso auth login`
- Confirm the current DB name/location:
  `turso db show 0dot-app-us-restore` (host is
  `…-kingofyadav.aws-us-east-1.turso.io`).
- Pick a low‑traffic window. Writes that land on the old DB between the dump
  and the env switch are lost — the app has no write queue.

## 1. Back up the current production DB

```bash
turso db shell 0dot-app-us-restore ".dump" > ~/0dot-prod-$(date +%F-%H%M).sql
wc -l ~/0dot-prod-*.sql          # sanity: should be large
grep -c "INSERT INTO" ~/0dot-prod-*.sql
```

Keep this file until the migration is confirmed good (step 6).

## 2. Create the Mumbai database

```bash
# A group pins the primary location. 'bom' = Mumbai (aws-ap-south-1).
turso group create mumbai --location bom
turso db create 0dot-app-in --group mumbai

# Load the dump
turso db shell 0dot-app-in < ~/0dot-prod-*.sql
```

## 3. Verify the copy

```bash
for t in User Session Username Profile LedgerAccount LedgerEntry Post _prisma_migrations; do
  echo -n "$t: "
  echo "SELECT count(*) FROM \"$t\";" | turso db shell 0dot-app-us-restore | tail -1 | tr -d '\n'
  echo -n "  ->  "
  echo "SELECT count(*) FROM \"$t\";" | turso db shell 0dot-app-in | tail -1
done
```

Every pair must match. (`_prisma_migrations` matching is what lets
`scripts/migrate-deploy.mjs` see the schema as fully applied on the next
deploy — do **not** skip it.)

## 4. Mint an auth token for the new DB

```bash
turso db tokens create 0dot-app-in
# host: turso db show 0dot-app-in  ->  libsql://0dot-app-in-<org>.aws-ap-south-1.turso.io
```

## 5. Switch Vercel over (one deploy)

1. Update **Production** env vars (Vercel dashboard → project `0dot` →
   Settings → Environment Variables, or `vercel env`):
   - `DATABASE_URL` → `libsql://0dot-app-in-<org>.aws-ap-south-1.turso.io`
   - `DATABASE_AUTH_TOKEN` → the token from step 4
2. Pin the function region — add to `vercel.json`:
   ```json
   {
     "$schema": "https://openapi.vercel.sh/vercel.json",
     "regions": ["bom1"],
     "crons": [{ "path": "/api/cron/daily", "schedule": "23 3 * * *" }]
   }
   ```
3. Commit `vercel.json`, push to `main`, let it deploy.
   `scripts/migrate-deploy.mjs` runs against the new URL during the build —
   expect **"No pending migrations."** If it tries to apply migrations, the
   `_prisma_migrations` copy in step 3 was incomplete: stop and re‑check.
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
