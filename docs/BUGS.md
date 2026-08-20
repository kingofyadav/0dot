# Bug report: login → header flow

Found by code review + live testing (logging in/out repeatedly in Chrome) on
2026-07-31. Scope: `src/app/actions/auth.ts`, `src/app/login/page.tsx`,
`src/components/AuthTabs.tsx`, `src/lib/session.ts`, `src/proxy.ts`,
`src/components/SiteHeader.tsx`, `src/components/Sidebar.tsx`,
`src/components/MobileNavMenu.tsx`.

Items #1 and #3 were fixed in `aa3ca32` ("Fix scheduled-link enforcement,
account-status check, and rate limiting"). #2, #4, #5 were fixed in a later
session (uncommitted at time of writing — see working tree / next commit).

---

## 1. Login doesn't check account status — FIXED (aa3ca32)

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

**Fix applied:** `login()` now rejects with a generic "This account is no
longer active." error when `user.status !== "active"`, checked after the
password check (so a wrong-password guess still can't distinguish account
state) and before `createSession`. `getCurrentUser()` (`src/lib/session.ts`)
was also updated to reject non-active status, so an already-issued session
for a since-suspended account stops working too.

---

## 2. User-enumeration timing side-channel — FIXED

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

**Fix applied:** `login()` now compares against a module-level `DUMMY_HASH`
constant (`user?.passwordHash ?? DUMMY_HASH`) so `bcrypt.compare` always
runs, whether or not the email matched an account. Same root fix as item #10
below, which independently re-found this issue.

---

## 3. No rate limiting on login — FIXED (aa3ca32)

**File:** `src/app/actions/auth.ts:84` (`login`)
**Severity:** Medium (security)

No throttling on login attempts — open to brute-force and credential-stuffing.
Also called out as a pre-launch requirement in `docs/specs/phase-1-foundation.md`
§7.2, alongside signup, post creation, and link creation (none of which are
rate-limited either).

**Fix applied:** `src/lib/rate-limit.ts` adds an in-memory per-IP and
per-email rate limiter, applied to `login` (10/5min per IP, 5/5min per
email), checked before the DB lookup. Also applied to signup, post creation
(incl. quote-repost), and link creation in the same commit, closing the rest
of the §7.2 requirement.

---

## 4. Failed login clears the email field, not just the password — FIXED

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

**Fix applied:** both login forms' email inputs are now controlled
(`useState` + `value`/`onChange`) instead of plain uncontrolled inputs, so
the value survives the form-action reset regardless of submit outcome. The
password field is untouched — still plain/uncontrolled, so it still clears
on every submit as intended.

---

## 5. `ThemeToggleLogo` is mounted twice on every page — FIXED

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

**Fix applied:** `ThemeToggleLogo` now takes an optional `priority` prop
(default `true`, passed through to both `<Image>` tags). `SiteHeader`'s
mobile-header instance now passes `priority={false}`, leaving only the
desktop instance eagerly preloaded — 2 preloaded logo images per page load
instead of 4, confirmed via the rendered `<link rel="preload">` tags. (By
the time this fix landed, the logo had already moved out of `Sidebar.tsx`
into `SiteHeader.tsx`'s own two `<header>` blocks — same duplicate-mount
shape the bug describes, different file.)

---

## Verified working (no bug found)

- Login → session creation → header re-render: tested live, logging in via
  `/login` updates the sidebar (greeting, Bookmarks, Log out) immediately on
  redirect with no stale state and no console errors.
- Logout clears the session row and cookie correctly.
- `proxy.ts`'s `x-pathname` injection and the reserved-username-based
  `isProfilePage` check in `SiteHeader.tsx` correctly suppress the "Join for
  free" CTA on `/login` itself.

---

# Bug report: full 4-phase review (Phases 1–4)

Found by a 4-way parallel code review (one agent per phase, cross-checked
against each phase's spec) on 2026-07-31, with the top findings independently
re-verified by reading the actual code afterward. Scope: the entire app —
foundation/auth, social platform, communities, business platform. All 13
items below are now fixed, per the fix plan at
`/home/amit/.claude/plans/buzzing-fluttering-newt.md` (Groups A–K), executed
in a later session (2026-08-02; uncommitted at time of writing — see working
tree / next commit). `tsc --noEmit`, `eslint`, and `next build` all pass
clean after the fixes; Group A/E's visibility filtering and the
concurrency-dependent fixes (C, F, G, K) were verified by code review and
build/smoke-test only, not by exercising real race conditions or seeded
private-community/blocked-user/pending-business test data — see the fix
plan's own Verification section for what a fuller pass would still need to
check. One additional spec gap (`Link.businessId` / business links, Phase 4
§3.2) was found but deliberately excluded from the fix plan — it's an
unimplemented feature that was never in the Phase 4 build plan's actual
scope, not a regression; see "Known gap" at the bottom of this file.

Items #1–#3 share one root cause (`getFeedPosts`/`getTrendingPosts`/
`getCommunityFeedPosts` build their `where` clause with no visibility
filtering at all) and are fixed together as "Group A" in the plan.

---

## 1. Pending/unapproved businesses can broadcast their identity platform-wide — FIXED

**File:** `src/lib/businesses.ts:82-96` (`resolveBusinessAuthorContext`), `:119-125`
(`getPostableBusinesses`); `src/lib/feed-query.ts:75`
**Severity:** High (security / trust & safety — defeats a launch-blocking gate)

Neither `resolveBusinessAuthorContext` (called from `createPost`) nor
`getPostableBusinesses` (populates the "Post as" picker) checks
`Business.status`. `getFeedPosts` unconditionally includes `businessAuthor`
regardless of status.

**Repro:** create a business named after a real brand with no matching
website domain and no verified profile → lands `status: "pending"` (its own
page 404s, unsearchable, per §3.3's claim gate). As owner, the "Post as
[Business]" option is still offered in the composer. Post — it immediately
appears on every visitor's `/feed` and `/explore` with the business's name
and logo as the visible author, fully bypassing the claim/verification gate
before any admin review. Rejecting the business later only `SetNull`s
`businessAuthorId` going forward; it doesn't undo the exposure that already
happened.

**Suggested fix:** see plan Group A.

**Fix applied:** new `src/lib/post-visibility.ts` (`getPostVisibilityConditions`)
excludes posts whose `businessAuthor.status === "pending"` from
`getFeedPosts`/`getTrendingPosts`, wired into `/feed`, `/explore`,
`/trending`, and the profile page. Scoped to read-time filtering per the
plan — `resolveBusinessAuthorContext`/`getPostableBusinesses` themselves
were left as-is (out of Group A's scope).

---

## 2. Private community posts leak into Home/Explore/Trending — FIXED

**File:** `src/lib/feed-query.ts:61-84`, `src/lib/trending.ts:198-215`
**Severity:** High (privacy)

`getFeedPosts`/`getTrendingPosts` apply zero community-visibility filtering,
while the community's own page (`src/app/c/[slug]/page.tsx`) correctly gates
private content behind `canViewContent` — that gate is bypassed entirely by
the two global feed surfaces.

**Repro:** post inside a `visibility: "private"` community. The post appears
on `/explore` for a logged-out visitor and on `/feed` for anyone following
the author, community name attached, despite the viewer never being a
member.

**Suggested fix:** see plan Group A.

**Fix applied:** `getPostVisibilityConditions` excludes any post whose
`communityId` points at a `private` community unless the viewer is an
active-or-muted member of it, applied to `getFeedPosts`/`getTrendingPosts`.
`getCommunityFeedPosts` was left without this fragment — its own page
(`src/app/c/[slug]/page.tsx`) already gates private content via
`canViewContent` before the query even runs.

---

## 3. Blocked users' posts still show on Explore/Trending — FIXED

**File:** `src/lib/feed-query.ts:61-84`, `src/lib/trending.ts:198-215`
**Severity:** High (privacy / safety)

`getFeedPosts`/`getTrendingPosts` never call `isBlocked`/`isBlockedEitherWay`
(`src/lib/blocks.ts`), unlike `src/lib/messaging.ts`'s
`getMessagesForConversation`, which explicitly filters blocked senders.
Blocking's post-suppression only works on Home, and only as a side effect of
the `Follow` row being deleted on block — it does nothing for the two global
surfaces.

**Repro:** A blocks B. B's posts and replies still appear in A's `/explore`
and `/trending` feeds.

**Suggested fix:** see plan Group A.

**Fix applied:** new `getBlockedEitherWayUserIds` (bulk sibling of
`blocks.ts`'s `isBlockedEitherWay`) feeds an `authorId: { notIn: blockedIds }`
filter into `getFeedPosts`, `getTrendingPosts`, and `getCommunityFeedPosts`
(top-level posts, pinned posts, and nested replies all three), plus the
repost-wrapper visibility check.

---

## 4. Voice room join has no community-membership or ban check — FIXED

**File:** `src/app/actions/voice-rooms.ts:122-140` (`joinVoiceRoom`)
**Severity:** High (authorization bypass)

`joinVoiceRoom` only checks `room.status === "live"` and whether the caller
is already a participant — it never calls `getCommunityMember`, unlike
sibling actions (`createVoiceRoom`, `sendChatMessage`) which do check
membership first.

**Repro:** a user who was never a member of a private community — or who was
explicitly banned from it — calls `joinVoiceRoom` directly on a live room
there (bypassing the UI's Join button, which only hides for non-members but
doesn't stop the server action itself). They become a `listener`
participant, which then passes the participant-only gates on
`sendVoiceSignal` and the SSE stream route, letting them receive live audio
from a private room they were never allowed into — bypassing their own ban
in the process.

**Suggested fix:** see plan Group B — mirror `createVoiceRoom`'s existing
membership check.

**Fix applied:** `joinVoiceRoom` now calls `getCommunityMember` and requires
`status === "active"` before creating the participant row, same check
`createVoiceRoom` already used.

---

## 5. `toggleRepost` race condition duplicates reposts and inflates the count — FIXED

**File:** `src/app/actions/posts.ts:193-219`
**Severity:** Medium (correctness)

The existing-repost lookup runs outside any transaction, and there's no
unique DB constraint on `(authorId, repostOfId, body="")` to catch a race —
unlike `PostLike`/`Bookmark`/`PollVote`, which all use compound `@@id`
primary keys that make the equivalent race safe.

**Repro:** double-click the repost button quickly (or race two concurrent
requests). Both reads see "not reposted yet" before either write commits, so
both insert a repost row and increment `repostCount` — two duplicate repost
posts, count inflated by 2 for one logical action.

**Suggested fix:** see plan Group C — wrap read+write in one `db.$transaction`,
same pattern already used in `reviews.ts`/`appointments.ts`.

**Fix applied:** the existing-repost lookup and the create/delete branch now
both run inside one `db.$transaction(async (tx) => {...})`, using `tx` for
the read and the write — makes the whole toggle atomic instead of just the
write half.

---

## 6. Per-IP rate limits are spoofable via `X-Forwarded-For` — FIXED

**File:** `src/lib/rate-limit.ts:46-51` (`getClientIp`)
**Severity:** Medium (security, deployment-dependent)

`getClientIp()` trusts the client-supplied `X-Forwarded-For` header with no
validation that the request passed through a trusted proxy, and takes the
**first** (client-controlled) hop rather than the last (proxy-appended) one.

**Repro:** script login/signup requests with a unique `X-Forwarded-For` value
per request — each lands in a fresh bucket, so the per-IP
credential-stuffing/signup-spam protection never engages (only the
per-email bucket still limits attempts against one specific address).

**Suggested fix:** see plan Group D — take the last hop instead of the
first. Deployment-dependent mitigation (assumes exactly one trusted reverse
proxy in front); not a complete fix on its own.

**Fix applied:** `getClientIp` now takes `forwarded.split(",").pop()!.trim()`
(last hop) instead of the first. Documented as a deployment-dependent
mitigation in the code comment, same caveat as above — not verified against
a live reverse proxy (none exists in this dev environment).

---

## 7. Public profile page never renders the user's posts — FIXED

**File:** `src/app/[username]/page.tsx` (full file)
**Severity:** Medium (spec deviation)

No `Post` query and no `PostCard` usage anywhere on the page — contradicts
spec §3.4's stated section order and the Phase 1 build sequence's explicit
"public profile post list" deliverable.

**Repro:** visit a user's profile who has published posts — identity/bio/links
render correctly, zero posts appear anywhere.

**Suggested fix:** see plan Group E (depends on Group A's shared visibility
helper).

**Fix applied:** `src/app/[username]/page.tsx` now fetches a paginated post
list by reusing `getFeedPosts` scoped to the profile's own `authorId` (which
gets Group A's visibility filtering for free), precomputes liked/bookmarked/
voted state the same way `feed/page.tsx` does, and renders via `PostCard`
with a "Load more" cursor link. Confirmed live: a real seeded profile
(`/alice`) now renders its Posts section with no error.

---

## 8. Unhandled race on concurrent username claims — FIXED

**File:** `src/app/actions/auth.ts:58-77` (`signup`), `src/app/actions/profile.ts`
(`claimUsername`)
**Severity:** Low-Medium (robustness)

Check-then-act (`findUnique` then a separate `create`) with no catch around
the resulting Prisma `P2002` unique-constraint violation.

**Repro:** two concurrent signups (or a signup racing a `claimUsername` call)
for the same handle both pass the availability check before either insert
commits — the loser's `create` throws an uncaught `P2002`, surfacing as an
unhandled 500 instead of "That username is already taken."

**Suggested fix:** see plan Group F — catch `P2002` around the create,
return the existing friendly error.

**Fix applied:** both `signup`'s `db.user.create` and `claimUsername`'s
`db.$transaction` are now wrapped in try/catch, catching
`Prisma.PrismaClientKnownRequestError` with `code === "P2002"` and returning
the existing friendly "already taken" error instead of rethrowing.

---

## 9. Business staff can review their own business — FIXED

**File:** `src/app/actions/reviews.ts:37-79` (`createOrUpdateReview`)
**Severity:** Low (correctness / integrity)

No check that the reviewer isn't a `BusinessMember` of the target business —
undercuts the "review integrity" rationale in spec §11.1.

**Repro:** an owner/admin/editor submits a 5-star review of their own
business, inflating the denormalized `averageRating`/`reviewCount` used as a
search-ranking tie-break.

**Suggested fix:** see plan Group I.

**Fix applied:** `createOrUpdateReview` now returns an error if
`getBusinessMember(business.id, user.id)` finds any staff row for the
reviewer, checked right after the business is resolved.

---

## 10. Login timing side-channel enables email enumeration (Phase 4 re-confirmation) — FIXED

**File:** `src/app/actions/auth.ts:119`
**Severity:** Low

Same underlying issue as item #2 above, independently re-found by the
4-phase review's Phase 1 agent and verified again directly. Kept as its own
entry here since the fix (Group G in the plan) is the concrete one to apply;
item #2's original "Suggested fix" text describes the same dummy-hash
approach.

**Fix applied:** see item #2 above — one fix (`DUMMY_HASH` in
`src/app/actions/auth.ts`) closes both entries.

---

## 11. Declining a message request also hides it from the sender's own inbox — FIXED

**File:** `src/lib/messaging.ts:194-219` (`listInboxConversations`)
**Severity:** Low (UX / spec fidelity)

Once `declineMessageRequest` flips `status` to `"declined"`, no branch in
`listInboxConversations`'s `OR` clause matches for *either* participant —
spec §5.2/§5.8 only asks for hiding from the recipient, not the sender.

**Repro:** X messages a stranger Y, Y declines. X's inbox entry for that
conversation silently disappears with no explanation.

**Suggested fix:** see plan Group J — add a branch keeping it visible to the
`initiatedBy` user.

**Fix applied:** `listInboxConversations`'s `OR` array gained a fourth
branch, `{ requestState: { status: "declined", initiatedBy: userId } }`,
keeping a declined conversation visible to the person who sent the original
message while it stays hidden from the recipient who declined it.

---

## 12. Stale "speaker" role never cleared when the voice-room floor times out — FIXED

**File:** `src/app/actions/voice-rooms.ts:213-240` (`startSpeaking`)
**Severity:** Low

When a speaker exceeds `MAX_FLOOR_HOLD_MS` without calling `stopSpeaking`,
the next queued user can take the floor via `startSpeaking`, but only the
*new* speaker's `VoiceRoomParticipant.role` gets updated — the previous
speaker's row stays stuck at `"speaker"` forever.

**Repro:** a speaker's tab crashes mid-hold. Timeout lets someone else take
the floor. The original speaker's later `stopSpeaking` becomes a silent
no-op, and their "Request to speak" button never reappears until they leave
and rejoin the room.

**Suggested fix:** see plan Group K — reset the previous speaker's role in
the same transaction, mirroring `stopSpeaking`/`forceStopSpeaker`'s existing
pattern.

**Fix applied:** `startSpeaking`'s transaction gained a third (conditional)
op that resets the previous `room.currentSpeakerId` participant's role back
to `listener` whenever the new speaker isn't the same person, mirroring
`stopSpeaking`/`forceStopSpeaker`'s existing pattern exactly.

---

## 13. No brand-name collision check on business auto-approval — FIXED

**File:** `src/lib/businesses.ts:60-72` (`computeInitialBusinessStatus`)
**Severity:** Low-Medium (spec gap)

Only email/website domain match or `Profile.isVerified` gate auto-approval —
the business name itself is never checked, even though spec §3.3 explicitly
calls this out ("a name-collision/likely-impersonation heuristic... the
decision to gate is being made now, not deferred").

**Repro:** any `Profile.isVerified` user (verified as a real person, unrelated
to any company) creates a business named e.g. "Google" — goes straight to
`active`/searchable with zero check against the claimed name.

**Suggested fix:** see plan Group H — fuzzy-match against existing active
platform businesses (scoped fix; a full "well-known external brands" check
would need a third-party data source that doesn't exist in this codebase).

**Fix applied:** `computeInitialBusinessStatus` (now async) checks a
normalized (lowercased, punctuation/whitespace-stripped) name match against
existing `status: "active"` businesses before applying the domain-match/
isVerified gates; a match forces `pending` regardless of those other
signals. `createBusiness` passes `name` through and awaits the now-async
call.

---

## Known gap, deliberately not in the fix plan

**`Link.businessId` (business links) — Phase 4 spec §3.2/§16, never
implemented.** `Link` has no `businessId` column and no XOR constraint
against `profileId`; no business-links UI exists anywhere under `/b/[slug]`.
This wasn't listed as a step in `docs/specs/phase-4-build-plan.md`'s actual
execution plan, so it's a scope reduction made when the plan was written, not
a defect introduced during implementation. Flagging here for visibility, not
scheduled in the current fix plan.
