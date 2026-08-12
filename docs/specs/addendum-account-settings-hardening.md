# Addendum — Account Settings Hardening (2FA, Sessions, Privacy, Lifecycle)

Status: Built (2026-08-11) — all nine sections implemented per this spec.
Enforcement of the new Profile privacy fields at their call sites (DM-send,
tag-on-post, search/explore), real SMS delivery, and actually sending the
new email notification channel remain out of scope, exactly as this
document's own §1 flagged from the start.
Owner: TBD
Related: [ROADMAP.md](../ROADMAP.md), [phase-1-foundation.md](phase-1-foundation.md),
[phase-2-social-platform.md](phase-2-social-platform.md),
[phase-10-developer-platform.md](phase-10-developer-platform.md),
[phase-14-enterprise.md](phase-14-enterprise.md)

## 1. Purpose & Scope

`/s/[username]` (the owner-only settings shell, `src/app/s/[username]/layout.tsx`)
already covers 15+ sections — profile, security (password-only today),
notifications (push-only today), developer/API, monetization, content,
portfolio, links, cross-post, calendar, card, forms, short-links,
authorized-apps. A full survey of that tree (2026-08-08) found nine
account-safety/lifecycle features every mature platform's settings has that
this one is missing, several with the backing data model already
half-present. This addendum specs all nine as one build. **Not yet
implemented** — this document is the plan to build from in a future session,
per this repo's usual "read the spec, then build" workflow.

**In scope:** two-factor authentication, active-session/device management,
blocked-users management page, change-email/change-phone flows, self-serve
account deactivation/deletion/data-export, granular email notification
preferences, general privacy settings, login history, language/timezone/
accessibility preferences.

**Out of scope (flagged inline where relevant, not silently dropped):**
actually *sending* the new email notification channel (the preference
plumbing is built; wiring every notification producer to check it is
follow-up work, matching how push delivery preferences already work without
touching every producer); enforcing the new privacy fields at their
call sites (DM-send, tag-on-post, search/explore — the fields and settings
UI are built, the enforcement checks are noted as follow-up per field);
real SMS delivery (a provider seam is built, matching `email.ts`'s existing
console-fallback pattern, no real provider wired); suspicious-login email
alerts (a notification-producer concern, same posture as email sending
above).

## 2. Schema changes (one `prisma/schema.prisma` edit, one migration)

On `User`:
- `twoFactorSecret String?` — base32 TOTP secret, plain (matches this
  codebase's existing "trust the DB" posture — nothing else is
  field-encrypted, e.g. `phone`)
- `twoFactorEnabledAt DateTime?`
- `locale String?`, `timezone String?` — account-level prefs (§10)
- `deletionScheduledFor DateTime?` — set on deactivation, sweeper deletes
  once passed
- `accessibilityPrefsJson String?` — hand-serialized
  `{ reducedMotion, fontScale, highContrast }`, matching this codebase's
  "no native `Json` scalar" convention (`hoursJson`, `imagesJson`, etc.)

On `Session` (§4 needs metadata that doesn't exist today):
- `userAgent String?`, `ipAddress String?`, `lastSeenAt DateTime @default(now())`

New models:
- `TwoFactorRecoveryCode { id, userId, codeHash, usedAt DateTime?, createdAt }`
  — hash with `createHash("sha256")` exactly like `PasswordResetToken.tokenHash`
  (same "account-takeover-capable secret" reasoning documented on that model)
- `PendingTwoFactorChallenge { id, userId, expiresAt }` — short-TTL (5 min)
  row referenced by an httpOnly cookie between password-check and TOTP-check
  during login (mirrors `Session`'s opaque-token-in-cookie shape, not JWT)
- `PendingEmailChange { id, userId, newEmail, token, expiresAt }` — mirrors
  `EmailVerificationToken`, kept as its own model per that model's own
  comment about not reusing a lower-trust token type for a different trust
  level
- `PendingPhoneChange { id, userId, newPhone, codeHash, expiresAt }`
- `LoginEvent { id, userId, createdAt, ipAddress, userAgent, success Boolean, method String // password | totp | recovery_code }`

On `Profile` (privacy fields live next to the existing `isPrivate`):
- `allowDmsFrom String @default("everyone") // everyone | followers | none`
- `allowTagging Boolean @default(true)`
- `discoverableInSearch Boolean @default(true)`

New dependency: `otplib` (RFC-6238 TOTP; no equivalent lib is currently in
`package.json`. `qrcode` is already present and covers rendering the
enrollment QR).

## 3. Two-factor authentication — `src/app/s/[username]/two-factor/`

- `src/lib/two-factor.ts`: `generateSecret()`, `verifyTotpCode(secret, code)`
  (via `otplib`'s `authenticator`), `generateRecoveryCodes()` (10 codes,
  `randomBytes`-based, hashed per §2's `TwoFactorRecoveryCode` convention),
  `verifyRecoveryCode(userId, code)` (marks `usedAt`, one-time use).
- `src/app/actions/two-factor.ts`: `startTwoFactorEnrollment` (generates
  secret, stores unconfirmed, returns `otpauth://` URL + QR data URI via
  `qrcode`), `confirmTwoFactorEnrollment` (verifies first code, sets
  `twoFactorEnabledAt`, issues + shows recovery codes once),
  `disableTwoFactor` (requires current-password re-entry, same
  `bcrypt.compare` gate as `changePassword`,
  `src/app/actions/auth.ts:346-395`), `regenerateRecoveryCodes`.
- `src/app/s/[username]/two-factor/page.tsx` + `TwoFactorSetupForm.tsx`
  (client, multi-step: QR → confirm code → show recovery codes once),
  following `ChangePasswordForm.tsx`'s `useActionState` shape.
- **Login flow** (`src/app/actions/auth.ts` `login()`,
  `src/app/login/page.tsx`): today `await createSession(user.id)` runs
  unconditionally right before the final redirects. Insert a branch there —
  if `user.twoFactorEnabledAt`, don't create the real session yet; create a
  `PendingTwoFactorChallenge` row, set a short-lived cookie referencing it,
  redirect to `/login/2fa`. New `src/app/login/2fa/page.tsx` + action
  `verifyLoginTwoFactor` (accepts TOTP or recovery code, rate-limited via
  `checkRateLimit('2fa:user:${user.id}', ...)`, matching login's own
  `login:identifier:...` key style), which then calls `createSession(user.id)`
  and continues the existing `emailVerifiedAt`-check/redirect logic
  unchanged.
- Nav: add a `"Security"` group entry
  `{ href: '${base}/two-factor', label: "Two-factor authentication" }` in
  `src/lib/settings-nav.ts`.

## 4. Active sessions / device management — `src/app/s/[username]/security/sessions/`

- Populate the new `Session.userAgent`/`ipAddress`/`lastSeenAt` fields in
  `createSession()` (`src/lib/session.ts`) and touch `lastSeenAt` inside
  `getCurrentUser()`'s existing per-request DB read (it already does a
  lookup every call, so this is a field bump on an existing query, not a
  new one).
- `src/app/s/[username]/security/sessions/page.tsx`: list
  `db.session.findMany({ where: { userId }, orderBy: { lastSeenAt: "desc" } })`,
  render each via `SettingsRow` with a trailing per-row revoke form —
  identical structure to `authorized-apps/page.tsx`'s list +
  `revokeOwnAuthorization` pattern. Tag the row matching
  `getCurrentSessionToken()` as "This device" (can't revoke itself —
  sign-out already covers that).
- `src/app/actions/session-management.ts`: `revokeSession(formData)` (single
  `db.session.delete`, guarded to caller's own `userId`),
  `revokeAllOtherSessions()` reusing the exact
  `deleteMany({ where: { userId, token: { not: currentToken ?? "" } } })`
  already written once in `changePassword` (`auth.ts`) — extract it there
  into this shared function and have `changePassword` call it too, rather
  than a third copy.
- Nav: `{ href: '${base}/security/sessions', label: "Active sessions" }`
  under the existing `"Security"` group.

## 5. Blocked users — `src/app/s/[username]/blocked/`

- `src/app/s/[username]/blocked/page.tsx`:
  `db.block.findMany({ where: { blockerId: currentUser.id }, orderBy: { createdAt: "desc" }, include: { blocked: { include: { username: true, profile: true } } } })`
  — same cursor-pagination shape as `src/app/[username]/followers/page.tsx`
  (`r => ({ ...r, id: r.blockedId })` before `paginate()`).
- Render rows via `UserListItem` (`src/components/UserListItem.tsx`)
  extended with an optional `trailing?: ReactNode` prop (it doesn't have one
  today) so this page can pass the exact unblock `<form>` already used on
  the profile page (`src/app/[username]/page.tsx` ~L825,
  `action={unblockUser}` + hidden `blockedId`) — **reuse `unblockUser` from
  `src/app/actions/block.ts` unmodified**, just add
  `revalidatePath(\`/s/${handle}/blocked\`)` to `revalidateBlockPaths()`
  there.
- Nav: new `"Privacy"` group (doesn't exist yet) with
  `{ href: '${base}/blocked', label: "Blocked users" }`.

## 6. Change email / change phone — `src/app/s/[username]/security/` (new subpages)

- Email: `src/app/actions/account-contact.ts` `requestEmailChange` — mirrors
  signup's verification flow (`auth.ts` `signup()` L148-171): generate
  `randomBytes(24).toString("hex")` token, create a `PendingEmailChange` row
  (24h TTL), send via `getEmailSender().send()` (`src/lib/email.ts`) a link
  to `${getAppOrigin()}/verify-email-change?token=...`. New route
  `src/app/verify-email-change/page.tsx` applies the change
  (`db.user.update({ email: newEmail })`) and deletes the pending row.
- Phone: **no SMS provider exists in this codebase today** (confirmed —
  phone is currently collected unverified). Build the same seam `email.ts`
  established: `src/lib/sms.ts` with an `SmsSender` interface, a
  `ConsoleSmsSender` dev-fallback (logs the code, same posture as
  `ConsoleEmailSender`), and a `getSmsSender()` chosen by an `SMS_PROVIDER`
  env var — leave the real-provider branch unimplemented (throws "not
  configured") the same way `SmtpEmailSender` needed `SMTP_HOST` to
  activate. This gets the flow fully working in dev and ready to wire a
  real provider later without redesigning it.
- `src/app/s/[username]/security/contact/page.tsx` (or fold into
  `security/page.tsx`): forms for both, following `ChangePasswordForm.tsx`'s
  `useActionState` shape, both requiring current-password re-entry
  (`bcrypt.compare`) before issuing the change, same as `changePassword`.

## 7. Account deactivation, deletion, data export

- `src/app/actions/account-lifecycle.ts`:
  - `deactivateAccount` — requires password re-entry, sets
    `status: "deactivated"`, `deletionScheduledFor: now + 30d`. No extra
    session-kill code needed — `getCurrentUser()` already force-logs-out any
    non-`"active"` user on its next read (`session.ts`).
  - `reactivateAccount` — callable only from the (existing) login flow when
    `user.status === "deactivated"` and `deletionScheduledFor` hasn't
    passed: clears both fields. Needs one small branch added to `login()`
    next to its existing `if (user.status !== "active")` check.
  - `requestAccountDeletion` — same as deactivate but no reactivation path
    surfaced (still just sets the two fields; the *scheduled* deletion is
    what actually erases data, so "deactivate" and "request deletion" differ
    only in UI copy/confirmation strength, not mechanics — avoids two
    divergent code paths for what's the same state transition).
  - `exportAccountData` — no schema/model needed. Gathers the user's own
    rows (profile, posts, links, portfolio entries, etc. — scope to what's
    cheap to query, not every table in the schema) into one JSON object.
- `src/app/api/account/export/route.ts`: `GET` handler,
  `requireVerifiedUser()` inside, calls `exportAccountData`, streams the
  JSON back with `Content-Disposition: attachment` — avoids inventing a
  file-storage row for a one-shot download (no existing "generated file"
  model to reuse here).
- `src/lib/account-deletion.ts`: `deleteEligibleAccounts()` (query
  `status: "deactivated", deletionScheduledFor: { lte: new Date() }`,
  hard-delete or anonymize per row — cascade rules already exist on most
  relations via `onDelete: Cascade`) + `startAccountDeletionScheduler()`,
  copying `startDmcaRestorationScheduler`'s exact shape
  (`src/lib/dmca.ts:181-212`): hourly interval, `globalThis` boolean guard.
  Wire the `await import(...); startAccountDeletionScheduler();` call into
  `instrumentation.ts` alongside the existing scheduler imports.
- `src/app/s/[username]/account/page.tsx`: three sections (export,
  deactivate, delete) each behind its own confirm step, password re-entry
  via the same `bcrypt.compare` gate as `changePassword`.
- Nav: new `"Account"` group (or fold into `"Security"`) with
  `{ href: '${base}/account', label: "Account management" }`.

## 8. Granular email notifications — extend existing `notifications/page.tsx`

No new files needed for the plumbing — `setDeliveryPreference`
(`src/lib/push.ts`) and `setNotificationDeliveryPreferenceAction`
(`src/app/actions/push.ts`) are already channel-agnostic (`channel: string`;
the schema comment on `NotificationDeliveryPreference.channel` already lists
`in_app | push | email`). Add to `src/app/s/[username]/notifications/page.tsx`:
- A second curated array `EMAIL_NOTIFICATION_TYPES` (likely a *smaller*
  subset than `PUSH_NOTIFICATION_TYPES` — omit high-frequency low-value ones
  like `like`/`mention` from email by default; keep `message`,
  `new_subscriber`, `tip_received`, `appointment_request`, etc.)
- A second `<div className="settingsGroup">` querying `channel: "email"`
  rows the same way the push block queries `channel: "push"`, reusing
  `PushDeliveryToggle` (rename to `DeliveryToggle` since it's no longer
  push-only, update its one caller) with `channel="email"`.
- Actually sending email notifications is explicitly out of scope here — see
  §1.

## 9. General privacy settings — `src/app/s/[username]/privacy/`

- `src/app/s/[username]/privacy/page.tsx` + `PrivacySettingsForm.tsx`: three
  controls backed by the new `Profile.allowDmsFrom` / `allowTagging` /
  `discoverableInSearch` fields, submitted via one `useActionState` form
  following `EditProfileForm.tsx`'s pattern (it already updates `Profile`
  rows).
- `updatePrivacySettings` action alongside `updateProfile` (check
  `EditProfileForm`'s import for the exact file — likely
  `src/app/actions/profile.ts`).
- Enforcement is out of scope here — see §1. Flagged per-field as follow-up:
  DM-send action needs an `allowDmsFrom` check, tag-on-post needs an
  `allowTagging` check, search/explore query needs a `discoverableInSearch`
  `where` clause.
- Nav: add to the `"Privacy"` group introduced in §5:
  `{ href: '${base}/privacy', label: "Privacy" }`.

## 10. Login history — surfaced inside `security/sessions/page.tsx`

- Write a `LoginEvent` row at every `login()` attempt (success and failure)
  in `src/app/actions/auth.ts`, and at every 2FA verification attempt in the
  new `verifyLoginTwoFactor` action — capture `ipAddress`/`userAgent` from
  the request (Next.js `headers()`).
- Add a second block to the sessions page (or a `security/history/page.tsx`
  if it gets long): last ~20 `LoginEvent` rows, newest first, flagging
  failed attempts.
- No alerting/email-on-suspicious-login in this pass — see §1.

## 11. Language / timezone / accessibility prefs — `src/app/s/[username]/preferences/`

- `src/app/s/[username]/preferences/page.tsx` + form: `locale`/`timezone`
  dropdowns backed by the new `User` fields (small static list of common
  timezones/locales, not a full IANA dropdown — matches this app's existing
  "curated subset" posture used for notification types).
- Accessibility prefs (reduced motion, font size, high contrast): no natural
  backing field anywhere in the schema and no existing theme-preference
  mechanism beyond `Profile.themePreset` (which is about profile appearance,
  not personal reading prefs) — backed by the new `User.accessibilityPrefsJson`
  (§2), applied via a `data-*` attribute on `<html>` read from a
  cookie/session so it works without a client flash — same idea as
  `themePreset` but for accessibility instead of color.
- Nav: `{ href: '${base}/preferences', label: "Language & accessibility" }`,
  new `"Preferences"` group or folded into `"Profile"`.

## 12. Suggested build sequence

1. Schema migration (§2) — everything else depends on it.
2. §4 Active sessions (touches `session.ts`/`getCurrentUser()`, which §3's
   login-flow branch and §10's login-history writes both build on next).
3. §3 Two-factor auth (needs the login-flow hook point established cleanly
   by step 2's session work).
4. §10 Login history (small addition once §3's login flow is in place).
5. §6 Change email/phone, §7 account lifecycle — independent of 2FA/sessions,
   can run in parallel with steps 2-4.
6. §5 Blocked users, §9 Privacy settings — both introduce the new
   `"Privacy"` nav group, do together so the group is added once.
7. §8 Email notification prefs, §11 language/timezone/accessibility — purely
   additive, no dependencies, do last.

## 13. Verification

- `npx prisma migrate dev` after the schema edit; confirm no destructive
  changes flagged on existing tables.
- `npx tsc --noEmit` (or the repo's existing typecheck script) after each
  slice above — this plan touches ~15 new route files plus several shared
  ones (`session.ts`, `auth.ts`, `push.ts`/`PushDeliveryToggle`,
  `settings-nav.ts`, `UserListItem.tsx`, `block.ts`, `instrumentation.ts`).
- Manual pass through the dev server for each feature:
  - Enroll 2FA, log out, log back in with a TOTP code, then a recovery code.
  - Open two browser profiles, confirm both sessions list each other, revoke
    one from the settings page and confirm the other is logged out on next
    nav.
  - Block a user from their profile, confirm they appear in
    `/s/[handle]/blocked`, unblock from there, confirm the profile page
    reflects it.
  - Request an email change, confirm the console-logged verification link
    (dev `EmailSender`) applies it.
  - Deactivate an account, confirm login shows a reactivate path before the
    30-day window and that `getCurrentUser()` rejects the stale session
    immediately after deactivation.
  - Toggle an email notification preference off, confirm the
    `NotificationDeliveryPreference` row is written with `channel: "email"`.
  - Set privacy fields, confirm they persist on the `Profile` row
    (enforcement itself is follow-up, not verified end-to-end here).
  - Check `security/sessions` (or `security/history`) shows the
    just-completed login as a `LoginEvent` row.
  - Set language/timezone/accessibility prefs, confirm `<html>` picks up
    the accessibility attributes on reload.
