# Secrets & Env Var Audit — 0dot

Status table only. **No secret values are stored in this file** — only whether a
key is set locally and in Vercel Production, and where to obtain/rotate it. Real
values live in `.env` / `.env.local` / `.env.vercel` (all gitignored) or the Vercel
dashboard env store directly.

Linked Vercel project: `0dot/0dot.india` (https://0dot.in). Relinked 2026-10-24 —
the previous `.vercel/project.json` pointed at a project (`0dot`) that was no
longer accessible (deleted or transferred).

Last updated: 2026-10-24

| Key | Local | Vercel Prod | Requirement | Source | How to get/generate | Note |
|---|---|---|---|---|---|---|
| `DATABASE_URL` | ✅ | ✅ | required | Turso/libsql | turso db show <name> --url |  |
| `DATABASE_AUTH_TOKEN` | ❌ | ✅ | required (prod) | Turso/libsql | turso db tokens create <name> |  |
| `KV_REST_API_URL` | ❌ | ✅ | optional | Upstash (Vercel marketplace) | vercel integration add upstash/upstash-kv |  |
| `KV_REST_API_TOKEN` | ❌ | ✅ | optional | Upstash (Vercel marketplace) | vercel integration add upstash/upstash-kv |  |
| `APP_ORIGIN` | ❌ | ✅ | has default | app config | set manually per env |  |
| `MESSAGE_ENCRYPTION_KEY` | ✅ | ✅ | required | generated locally | node -e crypto.randomBytes(32) | DO NOT ROTATE — in use |
| `DOWNLOAD_TOKEN_SECRET` | ✅ | ✅ | required (prod) | generated locally | node -e crypto.randomBytes(32) | prod has its own value; local regenerated 2026-10-24 |
| `CRON_SECRET` | ✅ | ✅ | required (prod) | generated locally | node -e crypto.randomBytes(32) | prod has its own value; local regenerated 2026-10-24; also needed as GitHub Actions secret |
| `ALLOW_STUB_SSO` | ❌ | ❌ | dev-only, leave unset | n/a | leave unset in prod/staging | correctly unset in prod |
| `SENTRY_DSN` | ✅ | ✅ | optional | Sentry (Vercel marketplace) | sentry.io project settings |  |
| `NEXT_PUBLIC_SENTRY_DSN` | ✅ | ❌ | derived from SENTRY_DSN | Sentry | filled by next.config.ts at build | expected unset — not a gap |
| `SENTRY_ORG` | ✅ | ❌ | optional | Sentry | sentry.io org settings | gap — needed for source-map upload alongside SENTRY_AUTH_TOKEN |
| `SENTRY_PROJECT` | ✅ | ❌ | optional | Sentry | sentry.io project settings | gap — same as SENTRY_ORG |
| `SENTRY_AUTH_TOKEN` | ✅ | ✅ | optional (build-time) | Sentry | sentry.io auth tokens |  |
| `SENTRY_DEBUG` | ❌ | ❌ | optional flag | n/a | set '1' only for debugging | correctly unset in prod |
| `ANTHROPIC_API_KEY` | ❌ | ❌ | optional (stub w/o) | Anthropic Console | console.anthropic.com | AI features running as stub in prod |
| `SMTP_HOST` | ❌ | ❌ | optional (stub w/o) | email relay | Resend/SES/Postmark/Mailgun | email running as console-log stub in prod |
| `SMTP_PORT` | ❌ | ❌ | has default (587) | email relay | n/a |  |
| `SMTP_USER` | ❌ | ❌ | optional | email relay | provider dashboard |  |
| `SMTP_PASS` | ❌ | ❌ | optional | email relay | provider dashboard |  |
| `EMAIL_FROM` | ❌ | ❌ | has default | app config | n/a |  |
| `RESEND_EMAIL_DOMAIN` | ❌ | ❌ | has default | Resend | resend.com domains |  |
| `RESEND_API_KEY` | ❌ | ❌ | optional | Resend | resend.com API keys |  |
| `SMS_PROVIDER` | ❌ | ❌ | stub only — not implemented | n/a | leave unset | correctly unset |
| `LIVEKIT_URL` | ❌ | ❌ | optional (stub w/o) | LiveKit Cloud | cloud.livekit.io | livestream/voice running as stub in prod |
| `LIVEKIT_API_KEY` | ❌ | ❌ | optional (stub w/o) | LiveKit Cloud | cloud.livekit.io |  |
| `LIVEKIT_API_SECRET` | ❌ | ❌ | optional (stub w/o) | LiveKit Cloud | cloud.livekit.io |  |
| `ANDROID_APK_DOWNLOAD_URL` | ❌ | ❌ | optional | Vercel Blob hosting | re-host EAS build artifact |  |
| `IOS_TESTFLIGHT_URL` | ❌ | ❌ | optional | App Store Connect | TestFlight public link |  |
| `BACKUP_DIR` | ❌ | ❌ | has default | app config | n/a |  |
| `BACKUP_RETENTION_DAYS` | ❌ | ❌ | has default | app config | n/a |  |
| `BACKUP_DB_LABEL` | ❌ | ❌ | has default | app config | n/a |  |
| `PLATFORM_UPI_VPA` | ❌ | ❌ | optional, not yet wired | business info | n/a |  |
| `PLATFORM_UPI_PAYEE_NAME` | ❌ | ❌ | optional, not yet wired | business info | n/a |  |
| `UPSTASH_REDIS_REST_URL` | ❌ | ❌ | optional, not yet wired | Upstash | upstash.com console | distinct from KV_REST_API_URL — wallet feature, separate credential |
| `UPSTASH_REDIS_REST_TOKEN` | ❌ | ❌ | optional, not yet wired | Upstash | upstash.com console | distinct from KV_REST_API_TOKEN |
| `DRAIN_SECRET` | ✅ | ❌ | optional, not yet wired | generated locally | node -e crypto.randomBytes(32) | not yet in prod — fine for now since wallet code isn't wired |
| `YOUTUBE_API_KEY` | ❌ | ❌ | optional, not yet wired | Google Cloud Console | console.cloud.google.com |  |
| `WALLET_LAUNCH_PROMO_ENDS_AT` | ❌ | ❌ | optional, not yet wired | app config | n/a |  |
| `DATABASE_MAX_CONCURRENT_QUERIES` | ❌ | ❌ | optional tuning | app config | n/a |  |

## Real gaps (missing in BOTH local and production)

- `SENTRY_ORG` — Sentry — sentry.io org settings (gap — needed for source-map upload alongside SENTRY_AUTH_TOKEN)
- `SENTRY_PROJECT` — Sentry — sentry.io project settings (gap — same as SENTRY_ORG)
- `ANTHROPIC_API_KEY` — Anthropic Console — console.anthropic.com (AI features running as stub in prod)
- `SMTP_HOST` — email relay — Resend/SES/Postmark/Mailgun (email running as console-log stub in prod)
- `SMTP_PORT` — email relay — n/a
- `SMTP_USER` — email relay — provider dashboard
- `SMTP_PASS` — email relay — provider dashboard
- `EMAIL_FROM` — app config — n/a
- `RESEND_EMAIL_DOMAIN` — Resend — resend.com domains
- `RESEND_API_KEY` — Resend — resend.com API keys
- `LIVEKIT_URL` — LiveKit Cloud — cloud.livekit.io (livestream/voice running as stub in prod)
- `LIVEKIT_API_KEY` — LiveKit Cloud — cloud.livekit.io
- `LIVEKIT_API_SECRET` — LiveKit Cloud — cloud.livekit.io
- `ANDROID_APK_DOWNLOAD_URL` — Vercel Blob hosting — re-host EAS build artifact
- `IOS_TESTFLIGHT_URL` — App Store Connect — TestFlight public link
- `BACKUP_DIR` — app config — n/a
- `BACKUP_RETENTION_DAYS` — app config — n/a
- `BACKUP_DB_LABEL` — app config — n/a
- `PLATFORM_UPI_VPA` — business info — n/a
- `PLATFORM_UPI_PAYEE_NAME` — business info — n/a
- `UPSTASH_REDIS_REST_URL` — Upstash — upstash.com console (distinct from KV_REST_API_URL — wallet feature, separate credential)
- `UPSTASH_REDIS_REST_TOKEN` — Upstash — upstash.com console (distinct from KV_REST_API_TOKEN)
- `YOUTUBE_API_KEY` — Google Cloud Console — console.cloud.google.com
- `WALLET_LAUNCH_PROMO_ENDS_AT` — app config — n/a
- `DATABASE_MAX_CONCURRENT_QUERIES` — app config — n/a

## Notes

- `MESSAGE_ENCRYPTION_KEY` is already set and in active use in prod — **do not rotate**; doing so makes any already-encrypted data unreadable.
- `CRON_SECRET` and `DOWNLOAD_TOKEN_SECRET` already exist in Vercel Production (as marketplace-masked secrets) — fresh *local-only* values were generated 2026-10-24 for dev; this is correct, per `.env.example`'s own guidance never to reuse a dev value in prod.
- `DRAIN_SECRET` is missing from prod — acceptable for now since the coin-wallet feature isn't wired into code yet, but generate and set it before that ships.
- `SENTRY_ORG` / `SENTRY_PROJECT` are now set **locally** (2026-10-24) but still missing in **Vercel Production** — add them there too (Project Settings → Environment Variables) so source-map upload works on real builds.
- Everything else missing is either a stub-by-design (SMS, LiveKit, email, AI) or a not-yet-wired feature (UPI wallet, YouTube) — see the gaps list above for exact provider links.
