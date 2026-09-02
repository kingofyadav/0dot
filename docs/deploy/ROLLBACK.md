# Rolling back a bad production deploy

`.github/workflows/smoke-test.yml` runs `scripts/smoke-test.mjs` against
`https://0dot.in` after every successful Production deployment and posts a
job summary with a rollback command if it fails. This is **alert-only** —
nothing rolls back automatically, on purpose: a flaky or false-positive
smoke test auto-reverting a legitimate deploy is worse than a human
spending a minute confirming it's real first.

## 1. Confirm it's real

Check the failing check(s) in the workflow run's log first. A single flaky
check (timeout, transient 5xx) is worth one manual re-run
(`workflow_dispatch` on the same workflow) before rolling back anything.

## 2. Roll back

```bash
npm i -g vercel@latest   # if not already current
vercel login             # if not already linked/authed
vercel rollback          # rolls back to the previously-promoted deployment
```

To target a specific deployment instead of "the previous one":

```bash
vercel ls                        # list recent deployments
vercel promote <deployment-url>  # promote a specific one to Production
```

## 3. Verify

Re-run the smoke test against production once the rollback/promotion has
finished propagating:

```bash
node scripts/smoke-test.mjs
```

or trigger the `Post-deploy smoke test` workflow via `workflow_dispatch`.

## 4. Follow up

- File/update an issue describing what broke, before context is lost.
- If the failure involved data (not just a broken route), check whether
  [docs/deploy/BACKUPS.md](./BACKUPS.md) is relevant — e.g. a bad migration
  needs the DB looked at too, not just the deployed code rolled back.
