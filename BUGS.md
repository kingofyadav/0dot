# Bug report: login → header flow

Found by code review + live testing (logging in/out repeatedly in Chrome) on
2026-07-31. Scope: `src/app/actions/auth.ts`, `src/app/login/page.tsx`,
`src/components/AuthTabs.tsx`, `src/lib/session.ts`, `src/proxy.ts`,
`src/components/SiteHeader.tsx`, `src/components/Sidebar.tsx`,
`src/components/MobileNavMenu.tsx`.

Not yet fixed — this is the findings list only.

---

## 1. Login doesn't check account status

**File:** `src/app/actions/auth.ts:84-110` (`login`)
**Severity:** High (security / trust & safety)

`User.status` (`prisma/schema.prisma`) is `active | suspended | deactivated | deleted`,
but `login()` never reads it:

```ts
const user = await db.user.findUnique({ where: { email }, include: { username: true } });
if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
  return { error: "Incorrect email or password." };
}
await createSession(user.id);
```

A suspended, deactivated, or (soft-)deleted account can still log in and get a
fully valid session as long as the password is correct. The field exists
specifically to gate this and currently does nothing.

**Suggested fix:** after the password check succeeds, reject (or branch to an
account-specific message) when `user.status !== "active"`, before calling
`createSession`.

---

## 2. User-enumeration timing side-channel

**File:** `src/app/actions/auth.ts:96`
**Severity:** Medium (security)

```ts
if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
```

Short-circuit evaluation means `bcrypt.compare` (deliberately slow, ~100ms+)
only runs when a matching user is found. A request for a nonexistent email
returns almost instantly; a request for a real email with the wrong password
takes noticeably longer. That timing gap lets an attacker enumerate which
emails are registered without ever seeing a different error message.

**Suggested fix:** always run a bcrypt comparison, even on a missing user —
compare against a fixed dummy hash when `user` is null, so both paths take
approximately the same time.

---

## 3. No rate limiting on login

**File:** `src/app/actions/auth.ts:84` (`login`)
**Severity:** Medium (security)

No throttling on login attempts — open to brute-force and credential-stuffing.
Also called out as a pre-launch requirement in `docs/specs/phase-1-foundation.md`
§7.2, alongside signup, post creation, and link creation (none of which are
rate-limited either).

**Suggested fix:** needs a rate-limit strategy decision (per-IP, per-email, or
both; in-memory vs. a store that survives restarts) before implementing —
flagging as a scope decision, not a one-line fix.

---

## 4. Failed login clears the email field, not just the password

**File:** `src/app/login/page.tsx`, `src/components/AuthTabs.tsx`
**Severity:** Low (UX)
**Confirmed live**, not just from reading code — screenshot on reproduction.

**Repro:**
1. Go to `/login`.
2. Enter a valid email with the wrong password. Submit.
3. "Incorrect email or password." appears — and **both** the Email and
   Password inputs are empty.

Only the password should need retyping after a failed attempt; the email
persisting would save the user a step every time they mistype a password.

**Suggested fix:** thread the submitted email back through `ActionState` (or
have the client component hold it in local state across the submit) and set
it as the email input's `defaultValue` on error.

---

## 5. `ThemeToggleLogo` is mounted twice on every page

**File:** `src/components/SiteHeader.tsx:37`, `src/components/Sidebar.tsx:21`
**Severity:** Low (perf, not broken)

`SiteHeader` renders both `<Sidebar>` (desktop) and the mobile `<header>`
unconditionally — CSS hides whichever doesn't match the current viewport —
and each contains its own `<ThemeToggleLogo>`. `ThemeToggleLogo` itself
renders two `<Image priority>` tags (light/dark variants). Net effect: **4
priority-preloaded logo images on every single page load**, when only 2 are
ever visible at once.

Not a functional bug — clicking either toggle works and both stay in sync
(they both read/write `document.documentElement`'s `data-theme` directly) —
but it's an easy, free fix sitting right in the code being asked about.

**Suggested fix:** lift `ThemeToggleLogo` out of the two conditionally-visible
branches, or drop `priority` from whichever pair is offscreen — needs the two
render sites reconciled either way.

---

## Verified working (no bug found)

- Login → session creation → header re-render: tested live, logging in via
  `/login` updates the sidebar (greeting, Bookmarks, Log out) immediately on
  redirect with no stale state and no console errors.
- Logout clears the session row and cookie correctly.
- `proxy.ts`'s `x-pathname` injection and the reserved-username-based
  `isProfilePage` check in `SiteHeader.tsx` correctly suppress the "Join for
  free" CTA on `/login` itself.
