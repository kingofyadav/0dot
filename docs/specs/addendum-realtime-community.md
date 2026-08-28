# Addendum — Realtime Backplane & Community / Business Realtime

Status: **All five phases landed — 2026-08-29.** (D has its own spec —
[addendum-voice-rooms-livekit.md](addendum-voice-rooms-livekit.md).)
A — bus + in-memory + Redis (Upstash) drivers; 4 pub/sub modules + presence
refactored; load spike 20 × 1000 @ 250/s → 100% delivery, all verified live.
B — mobile AppState-gated SSE + exponential backoff + `resync`-on-reconnect;
push suppressed while a stream is open; `useAppForeground` feed/notifications
reconcile.
C — community live chat on mobile: v1 routes, enriched `CommunityChatEvent`,
`CommunityChatBody`, shared `createEventStream`, `Last-Event-ID` replay.
D — voice rooms on the LiveKit SFU (mesh removed), web + mobile code complete.
E — business signals: contact-message push (the one gap) + `bizview` viewer
count; everything else already pushed.
**Open across the phases:** a device/deploy pass for C (mobile chat), D
(mobile voice — needs a dev-client rebuild), and E (viewer count) — all
blocked on the branch not being deployed (`project_deploy_lag_smoke_test`),
not on code. Two-way business inbox deferred (needs the acting-as surface).
Owner: TBD
Related: [addendum-mobile-pro-upgrade.md](addendum-mobile-pro-upgrade.md) ·
[phase-3-communities.md](phase-3-communities.md) ·
[phase-2-social-platform.md](phase-2-social-platform.md) ·
[../foundations/MOBILE.md](../foundations/MOBILE.md) ·
[phase-15-mobile-apps.md](phase-15-mobile-apps.md)

## 1. Purpose & Scope

Every realtime surface in the product today — DMs, notifications, presence,
community live chat, community voice rooms, livestream chat — runs on the
**same in-memory, single-process pub/sub pattern** (`src/lib/message-events.ts`,
`community-chat-events.ts`, `livestream-chat-events.ts`, `voice-signal-events.ts`,
`presence.ts`). Each module is a `globalThis`-backed `Map` of subscribers,
with a fire-and-forget `publish*`. Every one of them carries the same
comment: *"resets on restart, doesn't share state across multiple instances
— fine for the current single-process deployment, revisit if this ever runs
multi-instance."*

**It already runs multi-instance.** The app is deployed on Vercel Fluid
Compute, which reuses and scales function instances. A `publish` on instance
A never reaches an SSE subscriber connected to instance B. Today this is
masked by low traffic keeping most users on one warm instance; it is not a
correctness guarantee, and it fails silently (the recipient just doesn't get
the live update — they see it on next navigation). Community chat and voice
were **explicitly deferred on mobile** in the mobile pro-upgrade addendum
pending "real bearer-token SSE infra, its own design pass." This is that
design pass, and it fixes the web ceiling at the same time.

**In scope:** a shared realtime backplane (Phase A); mobile realtime
hardening — battery, reconnect, replay, background = push (Phase B);
community live chat on mobile (Phase C); community voice rooms done properly,
web + mobile (Phase D); business live signals (Phase E).

**Out of scope:** a full move to a managed realtime SaaS (Ably/Pusher/
Supabase Realtime) — evaluated in §8, deferred; the SQLite→Postgres decision
(tracked elsewhere — the backplane is designed to not depend on it); any new
product surface not already shipped on web.

## 2. Constraints that shape this work

- **SSE stays the server→client transport.** It already works on Fluid
  Compute with zero upgrade dance, every route is built, `react-native-sse`
  is the mobile client, browsers auto-reconnect. WebSockets on Vercel
  Functions are supported now but buy nothing here — client→server stays
  plain POST. (Voice signaling is the one exception — see Phase D.)
- **`maxDuration = 300` is a hard ceiling.** Vercel kills every SSE
  connection at 5 minutes. Clients reconnect; the presence grace period
  (`PRESENCE_OFFLINE_GRACE_MS = 15_000`) is already tuned around this. Any
  replay/catch-up design must assume a reconnect every ≤5 min per client.
- **Turso (libSQL) is the database.** No Postgres `LISTEN/NOTIFY`. The
  backplane must be its own thing.
- **`next build` eager-secret gotcha** (memory `project_next_build_eager_secret_gotcha`):
  the Redis client must be resolved lazily, never at module load — a preview
  build with no `UPSTASH_*` env vars must still compile and boot.
- **Two-tier rate limiting already exists** (memory `project_rate_limit_two_tier`):
  `checkRateLimit` (in-memory, best-effort) vs `enforceRateLimit` (durable).
  Chat send + voice join are user-facing write paths → durable tier.
- **Mobile native-dep discipline** (memory `project_m12_account_mgmt_devclient_crash`):
  Phase D adds `@livekit/react-native` + `@config-plugins/react-native-webrtc`
  → a dev-client rebuild, not `expo start`. Reanimated gotchas still apply.
- **`instrumentation.ts` lives in `src/`** (memory) — any boot-time backplane
  warmup hook goes there, not root.

## 3. Diagnosis — the five event modules

| Module | Key shape | Publish fan-out | Extra state |
|---|---|---|---|
| `message-events.ts` | `userId → Set<cb>` | `publishToUsers(userIds[])` | — |
| `community-chat-events.ts` | `communityId → Set<cb>` | `publishToCommunityChat(id)` broadcast | — |
| `livestream-chat-events.ts` | `livestreamId → Set<cb>` | broadcast | — |
| `voice-signal-events.ts` | `roomId → userId → Set<cb>` | targeted `sendSignal` + `broadcastRoomUpdate` | — |
| `presence.ts` | `userId → count` | — (read via `isUserOnline`) | offline grace timers |

Three of the five (`message-events`, `community-chat-events`,
`livestream-chat-events`) are **structurally identical** — a keyed
subscriber map + fire-and-forget broadcast. `voice-signal-events` is the
same with two-level keying. `presence` is different: it's a **counter with
TTL semantics**, not pub/sub — cross-instance presence needs `INCR`/`DECR`
on a shared store, not a message channel.

Payloads are tiny and mostly content-free by design (the client does
`router.refresh()` / refetch on any event). That means the backplane only
needs to move small JSON blobs with at-most-once delivery — no ordering or
durability guarantees at the transport layer. Replay (Phase B) is a
separate, opt-in concern.

## 4. Phase A — The realtime backplane

**Goal:** one shared pub/sub primitive, two drivers, every existing event
module refactored onto it with its **public API byte-identical**. No route,
action, or client change. With no Redis env vars present, behavior is
exactly as today (in-memory driver) — so this ships dark and is fully
reversible.

### 4.1 The abstraction — `src/lib/realtime/bus.ts`

```ts
export interface RealtimeDriver {
  publish(channel: string, message: string): void;            // fire-and-forget
  subscribe(channel: string, cb: (message: string) => void): () => void;
}
```

- `channel` is a namespaced string: `msg:<userId>`, `cchat:<communityId>`,
  `lchat:<livestreamId>`, `voice:<roomId>`, `voice:<roomId>:<userId>`.
- `message` is always a JSON string — the bus is untyped; each event module
  keeps its own typed `Event` union and does the `JSON.parse`/`stringify` at
  its edge (exactly what the mobile SSE client already does).
- Driver selected once, lazily, on first use: `UPSTASH_REDIS_REST_URL` present
  → Redis driver, else in-memory driver. Logged at selection (same posture as
  `db.ts`'s connection log).

### 4.2 In-memory driver — `src/lib/realtime/driver-memory.ts`

The current `globalThis`-backed `Map<string, Set<cb>>` logic, lifted verbatim
out of the five modules into one place. Dev-HMR-safe guard stays. This is the
default and the test driver.

### 4.3 Redis driver — `src/lib/realtime/driver-redis.ts` — **BUILT**

- **Provider: Upstash for Redis** (`upstash/upstash-kv` on the Vercel
  Marketplace — the `vercel-storage` skill's preferred serverless Redis).
  Provisioned as `upstash-kv-apricot-candle`; the integration sets the
  `@vercel/kv`-style env names — **`KV_REST_API_URL` / `KV_REST_API_TOKEN`**
  (plus `KV_URL` / `REDIS_URL` TCP strings, unused). `bus.ts` selects this
  driver whenever `KV_REST_API_URL` is set; `UPSTASH_REDIS_REST_URL` is a
  hand-set fallback.
- `publish` → `@upstash/redis` `redis.publish("rt:"+channel, message)` —
  REST, fire-and-forget, `.catch(log)`. Client built with
  `automaticDeserialization: false` so it moves raw JSON strings (the bus
  contract).
- `subscribe` → **one process-wide `PSUBSCRIBE rt:*`** per instance (over
  `@upstash/redis`'s SSE-backed `psubscribe`), with a local `Map` doing
  in-process fan-out. One upstream connection per instance regardless of
  user/room count — the pattern subscribe is what keeps this off Upstash's
  per-connection limits. Every message round-trips through Redis (an
  instance hears its own publishes back), so there's a single delivery
  path and no local-shortcut branching.
- **Verified 2026-08-29:** a two-client smoke (two independent `psubscribe`
  connections = two simulated instances) — every subscriber received every
  message regardless of which client published, on `msg:` / `cchat:` /
  `voice:` channels.
- **Fallback if Upstash pub/sub limits bite under real load:** `node-redis`
  against the `KV_URL` TCP endpoint with a duplicate `SUBSCRIBE` connection.
  Same `RealtimeDriver` interface — a driver swap, not a rewrite. The §4.6
  load spike decides whether that's needed.

### 4.4 Presence — `src/lib/realtime/presence-store.ts` — **BUILT**

Presence is not pub/sub, so it gets its own store, same driver split:

- **In-memory:** a `Map<userId, Set<connectionId>>` (per-connection, not a
  bool, so multi-tab/device works); `heartbeat` is a no-op. Same semantics
  as before.
- **Redis** (`presence-store-redis.ts`, lazily required): one **sorted set
  per user** — `presence:z:<userId>`, member = connectionId, score = the
  epoch-ms that connection's presence expires. Every read does
  `ZREMRANGEBYSCORE 0 <now>` then `ZCARD` (pipelined), so a hard-killed
  instance that never ran its SSE `cancel()` self-heals: its member's score
  lapses and the next read drops it. The SSE heartbeat (20s) re-`ZADD`s with
  a fresh 45s score (`refreshPresence()` — new export, wired into both
  stream routes' heartbeat interval); a 60s key TTL reaps the empty set.
- `isUserOnline` is now **`async`**. The 6 read call sites (4 Server
  Components rendering conversation lists, `MessagesBadge`,
  `api/v1/conversations`) switched to a batched
  `getOnlineUserIds(ids): Promise<Set>` resolved once per request (one
  pipelined round-trip for the whole page) rather than an await per row;
  `messages/[conversationId]` does a single `await isUserOnline`.
- **Verified 2026-08-29** against real Upstash: 2-connection online, clean
  disconnect, self-heal on a crashed connection, batched `getOnline`.

### 4.5 Refactor targets (public API unchanged)

| File | Change |
|---|---|
| `message-events.ts` | `subscribeToUser`/`publishToUsers` → `bus.subscribe("msg:"+id)` / loop `bus.publish` |
| `community-chat-events.ts` | → `bus` on `cchat:<id>` |
| `livestream-chat-events.ts` | → `bus` on `lchat:<id>` |
| `voice-signal-events.ts` | → `bus` on `voice:<roomId>` (room updates) + `voice:<roomId>:<userId>` (targeted signal) — **done** |
| `presence.ts` | → `presence-store` (§4.4); `markUserOnline` returns a connectionId, `refreshPresence` added, `isUserOnline` async + `getOnlineUserIds` batch — **done** |

All five are **done**. The four pub/sub modules kept every `subscribeTo*` /
`publishTo*` / `broadcast*` / `sendSignal` export name and signature, so no
SSE route or Server Action changed. `presence.ts` changed shape (§4.4) —
that rippled to the 2 stream routes (thread a connectionId, heartbeat) and
the 6 read call sites (batched `getOnlineUserIds`).

### 4.6 Verification

- New: `src/lib/realtime/__tests__/bus.test.ts` — in-memory driver
  subscribe/publish/unsubscribe, multi-subscriber fan-out, channel isolation.
- New: `presence-store.test.ts` — count up/down, grace timer, TTL expiry
  (fake timers).
- Existing SSE-route behavior unchanged — the `api/messages/stream` and
  `api/c/[slug]/chat/stream` manual smoke paths still pass.
- **Load spike — DONE** (`scripts/realtime-load-spike.mjs`): N simulated
  instances each holding one `PSUBSCRIBE rt:*` (the driver-redis.ts shape),
  a REST publish burst, asserting every instance got every message + latency
  percentiles. Results 2026-08-29: **8×500@100/s → 100% delivery, p99 449ms**;
  **20×1000@250/s → 100% delivery (0 of 20 000 missed), p50 252ms, p99 917ms.**
  Verdict: Upstash pub/sub carries the app's fan-out — the node-redis TCP
  fallback (§4.3) stays documented but is not needed. Re-run if a future
  feature needs sub-100ms delivery (the `~250ms` p50 is SSE-over-HTTP
  buffering; fine for "refetch" events, maybe not for live typing at scale).
- `pnpm test` + `pnpm lint` + `pnpm build` (with **and** without Redis env)
  green — verified 2026-08-29.

### 4.7 Provisioning — **DONE 2026-08-29**

```
vercel link                              # → 0dot/app
vercel integration add upstash/upstash-kv   # interactive; accept the addenda
vercel env pull .env.local --yes
```

Provisioned `upstash-kv-apricot-candle`, host `evolving-lobster-160013.upstash.io`.
Env vars set (dev/preview/prod): `KV_REST_API_URL`, `KV_REST_API_TOKEN`,
`KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL`. `@upstash/redis@^1.38`
added. Note the CLI provisions `KV_*` names, **not** `UPSTASH_REDIS_REST_*` —
`bus.ts` and `driver-redis.ts` read `KV_REST_API_URL` first. Preview/CI builds
with no KV env still use the in-memory driver and compile fine (verified).

## 5. Phase B — Mobile realtime hardening

Applies to the messages stream the app already ships (`src/realtime/`), and
is a prerequisite for Phase C's chat feeling solid.

### Landed 2026-08-29 (`mobile/src/realtime/messagesStream.ts` rewrite)

- **AppState-gated connection.** `MessagesStreamContext` now closes the
  `EventSource` on `background` and reconnects on `active` — via
  `createMessagesStream(...).setActive(boolean)` driven by an `AppState`
  listener. Holding SSE alive in the background drains the radio and Vercel
  kills it at 5 min anyway.
- **Reconnect with backoff.** `react-native-sse`'s internal fixed-interval
  reconnect (`_pollAgain`, which also adopts the server's `retry:` hint) is
  hard-disabled; `createMessagesStream` owns reconnection with exponential
  backoff (1s → 30s) + 50–100% jitter, reset to 0 on a clean `open`.
- **`resync` event.** On every reconnect *after the first* (a dropped
  socket, or an app-foreground reconnect) the stream emits a synthetic
  `{ type: "resync" }`. Consumers (`UnreadBadgeContext`, `(tabs)/messages`,
  `messages/[id]`) treat it as "refetch now" — the catch-up for anything
  published while the socket was down. Tested (`messagesStream.test.ts`,
  `MessagesStreamContext.test.tsx`; 63 mobile tests green).

### Also landed 2026-08-29

- **Background transport = push.** `dispatchPushEvent` (`src/lib/push.ts`)
  now returns early when `isUserOnline(recipientId)` — an open SSE stream
  (mobile foregrounds it, web keeps it per tab) already delivers the
  notification live in-app, so a push on top is redundant buzz. Every type,
  not a subset. The presence store's 45s self-heal keeps a stale-positive
  from swallowing pushes for long. Tested (`push.test.ts`: suppressed while
  online, resumes once the stream closes).
- **Foreground reconcile.** New `useAppForeground(cb)` hook — fires on a
  real background → active edge (not inactive → active). Wired into the
  feed (`(tabs)/index`) and notifications (`(tabs)/notifications`, which
  also now subscribes to `notification` / `resync` stream events), the two
  list surfaces that aren't stream consumers and so would otherwise sit
  stale (or on their offline-cache fallback) until a manual pull after the
  app was backgrounded on an already-focused tab. Tested
  (`useAppForeground.test.tsx`).

### Deferred to Phase C

- **Replay via `Last-Event-ID`.** Server assigns a monotonic id per event
  per channel, buffers the last ~50 in a Redis list with a short TTL; the
  route replays `id > Last-Event-ID` before going live. Correctness is
  already covered by `resync` (full refetch on reconnect) — replay is an
  *optimization* (append the 2 you missed vs refetch the list), and its
  real payoff is chat, where "append missed messages" beats "refetch all
  history". Better designed alongside Phase C's chat append logic so the
  buffer format matches how chat consumes it. New (in C):
  `src/lib/realtime/replay.ts`.

Verification for the rest: a device matrix pass (background 1 min / 10 min /
overnight → foreground), battery check (Android Battery Historian) with the
app idle-foregrounded for 30 min.

## 6. Phase C — Community live chat on mobile

Web has it (`api/c/[slug]/chat/stream`, `src/app/actions/community-chat.ts`,
spec §11.1). Mobile deferred it. **Core landed 2026-08-29.**

### Landed

- **`/api/v1` routes** under `communities/[slug]/chat/` (the v1 tree uses
  `communities/[slug]`, not the web `c/[slug]` URL), following the
  established pattern (`resolveApiRequest` → `requireScope` →
  `checkApiRateLimit` → `apiError`, cursor pagination):
  - `GET …/chat` — history `{ items, nextCursor, canSend }`, newest-first;
    same visibility gate as the web page (`isGatedFromCommunityContent`).
  - `POST …/chat` — send. `communities:write`, `requireVerifiedApiUser`,
    **`enforceRateLimit`** (durable, `community-chat:send:<user>:<community>`,
    30 / 5 min), active-membership check (a muted member can read but not
    send). Returns the created message; broadcasts it on `cchat:<id>`.
  - `GET …/chat/stream` — bearer-token SSE, same `cchat:<id>` bus channel
    as the cookie route (Phase A made it cross-instance-safe).
  - `DELETE …/chat/[messageId]` — author (not logged) or staff (logged as a
    mod action). The web `deleteChatMessage` action gained the same
    author-delete path for parity.
  - `POST …/chat/typing` — ephemeral "someone is typing" ping, in-memory
    `checkRateLimit` only, no DB.
- **`CommunityChatEvent` enriched** (`community-chat-events.ts`): the events
  now carry a payload — the full message on `new-chat-message`, the id on
  `chat-message-deleted`, plus `typing` — so a mobile client
  appends/removes one message instead of a refetch-per-event storm. The web
  `CommunityChatView` is payload-agnostic (`router.refresh()` on any event)
  and unaffected. Shared serializer: `serializeChatMessage`
  (`src/lib/community-chat.ts`).
- **Scope:** `communities:read` / `communities:write` already existed;
  descriptions widened to name chat (`oauth.ts`). `ensureFirstPartyApps()`
  auto-approves both for the first-party app.
- **Mobile:** `mobile/app/community/[slug]/chat.tsx` +
  `src/screens/CommunityChatBody.tsx` (screen-body discipline, like
  `ProfileScreenBody`). Inverted `FlatList`, cursor history on scroll-up,
  send round-trips through the v1 route + echoes back over the stream
  (dedupe on id), long-press to delete own/any message. Composer is a
  bottom-docked `KeyboardAvoidingView` bar (the DM-screen pattern — the
  right shape for a full-screen chat; the `BottomSheet` keyboard fix is for
  the modal `ReplySheet`, not this). Typing indicator with a 5s local
  expiry + prune timer; outgoing typing ping debounced to 1 / 3s.
  Entry point: a **Chat** button on the community screen header.
- **Shared SSE client:** `messagesStream.ts`'s connection logic extracted
  to `src/realtime/eventStream.ts` (`createEventStream` — AppState gating,
  backoff, `resync`); `createMessagesStream` and the new
  `createCommunityChatStream` are thin wrappers. The chat screen owns its
  stream lifecycle (open while mounted + foregrounded, `close()` on unmount).
- Tests: `src/lib/__tests__/community-chat.test.ts` (query + serializer),
  `mobile/.../CommunityChatBody.test.tsx` (load → live append/dedupe/delete/
  resync → close), `messagesStream.test.ts` still green after the refactor.

### Last-Event-ID replay — LANDED 2026-08-29

`src/lib/realtime/replay.ts`:
- `recordForReplay(channel, build)` — `INCR rt:seq:<channel>` for the seq,
  hands it to `build` to make the event, then `LPUSH rt:buf:<channel>
  "<seq>|<json>"` + `LTRIM 0 49` + `EXPIRE 120` on both keys, all pipelined
  (one round-trip). Called from `publishToCommunityChat` for
  `new-chat-message` / `chat-message-deleted` (not `typing`). Returns null
  without Redis → the event publishes un-sequenced and the stream sends no
  `id:`.
- `getReplayFrames(channel, afterSeq)` — `LRANGE`, parse, sort ascending;
  `{ kind: "frames" }` when the buffer's oldest seq ≤ afterSeq + 1
  (contiguous), else `{ kind: "gap" }`.
- `currentSeq(channel)` — `GET rt:seq` for the baseline `id:` on a fresh
  connection.

The chat stream route: on connect with `Last-Event-ID`, replay `seq >
lastId` with `id:` frames or emit `{type:"resync"}` on a gap; without the
header, emit a baseline `id:`. Live frames carry `event.seq` as their `id:`.

Mobile `eventStream.ts`: tracks the last `id:` seen (from message events and
`source.lastEventId` on teardown), seeds it into each reconnect's
`EventSource` so `react-native-sse` sends `Last-Event-ID`, and **only emits
the client-side `resync` when it has no id to replay from** — so the
messages stream (no server `id:`) is unchanged, and the chat stream replays.
Verified: live Redis smoke (`frames [3,4,5]` after seq 2; `gap` when the
buffer starts past the request), `eventStream.test.ts`.

- **Deferred within C:** read receipts (per-member cursor table — schema
  work, low value for a broadcast room), reactions, threads, a "new
  messages" pill (the list just appends for now).

### Verification

Done: `vitest` (lib + replay), mobile `jest` (screen + eventStream),
`next build` (routes register), live Redis replay smoke, an emulator smoke
(Chat button → screen renders → SSE connects with backoff).

**Blocked on deploy:** the full two-device send/receive pass. The mobile
build targets `https://0dot.in` (prod), which doesn't have these routes yet
— hitting `…/chat/stream` there 404s and the client (correctly) backs off
retrying. Needs the branch deployed (or a local tunnel) to test end-to-end;
this is the `project_deploy_lag_smoke_test` situation, not a bug.

## 7. Phase D — Community voice rooms

**Moved to its own spec: [addendum-voice-rooms-livekit.md](addendum-voice-rooms-livekit.md).**
D1 (server) + D2 (web) landed 2026-08-29 — the voice room's mesh WebRTC was
swapped for the **LiveKit SFU already running for livestreams**; D3 (mobile)
pending. The sketch below is superseded by that spec.

The largest and most different piece. Voice is **not** an SSE feature — SSE
carries only signaling. Building real-time audio on the message bus does not
scale and sounds bad.

- **Media: LiveKit.** LiveKit Cloud (generous free tier, Vercel-friendly,
  SOC2) as an SFU; `@livekit/react-native` + `@livekit/react-native-webrtc`
  on mobile, `@livekit/components-react` on web. Server mints room tokens via
  `livekit-server-sdk` in a `/api/v1/c/[slug]/voice/[roomId]/token` route
  (scoped, rate-limited).
- **Keep the existing SSE `voice:<roomId>` channel** for room *state* — the
  participant list, raised-hands queue, current-speaker, mod actions
  (mute/remove). That's low-frequency broadcast, already built
  (`voice-signal-events.ts`, `voice-rooms.ts` action, `voice-rooms.test.ts`),
  and Phase A made it cross-instance-safe. LiveKit handles only the audio +
  its own WebRTC signaling; the app's `voice-signal-events.ts` targeted-ICE
  path is **removed** (LiveKit owns that now).
- **Mobile:** `@config-plugins/react-native-webrtc` config plugin, mic
  permission strings, `expo-audio` background-audio mode, a dev-client
  rebuild. New: `mobile/app/community/[slug]/voice/[roomId].tsx`.
- **Web:** `src/app/c/[slug]/voice/[roomId]/` gains a real audio UI
  (currently signaling-only scaffold).
- **Cost guard:** room TTL, max participants, auto-close on empty, a
  per-community concurrent-room cap.

This phase gets its own `phase-N` spec before build — it's multi-session,
touches billing (LiveKit usage), legal (voice recording/retention policy —
default **off**), and native config on both platforms.

## 8. Phase E — Business live signals — LANDED 2026-08-29

Lowest urgency, deliberately minimal — **push-first, SSE only where a
dashboard is actually open**.

- **New-review / appointment request-confirm-cancel / job application →
  push:** ✅ **already built.** `reviews.ts`, `appointments.ts`, `jobs.ts`
  each already call the matching `notify*` (`src/lib/notifications.ts`) →
  `createNotification` → `dispatchPushEvent`, and Phase B's
  push-suppress-while-online now applies to them too. Verified — nothing to
  add.
- **New contact message → push:** ✅ **the one gap, now fixed.** The public
  `sendContactMessage` (`business-contact.ts`) recorded a `ContactMessage`
  and a CRM activity but never notified the team. New
  `notifyBusinessContactMessage({ businessId, businessSlug })` — system-
  generated (the sender may be logged out, so no actorId; bypasses
  `createNotification` like `notifyJobAlertMatch`), fans an in-app
  `business_contact` notification + a push to every owner/admin. Verb/href
  cases added.
- **"N people viewing" a business profile:** ✅ built.
  `src/lib/business-viewers.ts` — a self-healing sorted set per business
  (`bizview:z:<id>`, member = per-tab key, score = expiry; memory fallback),
  plus the `bizview:<id>` bus channel for the owner's live count.
  - `POST /api/b/[slug]/viewers/ping` — every viewer beacons every 30s (and
    once on `pagehide` via `sendBeacon`). Cheap, no held connection, public.
  - `GET /api/b/[slug]/viewers/stream` — **owner/admin-only** SSE; one
    connection per open dashboard, pushes `{ count }` on any join/leave
    (coalesced 500ms).
  - `src/components/BusinessViewerCount.tsx` on `/b/[slug]` — pings for
    everyone, renders "👁 N viewing now" only for the owner.
  - Verified: live Redis smoke (distinct-key count, re-ping no-op, expiry
    self-heal, drop) + `business-signals.test.ts`.
- **Business inbox (two-way customer ↔ business DMs): deferred, correctly.**
  `ContactMessage` is a one-way public form → admin queue by design (see
  its own spec §6.1/§6.2). Making it a two-way thread needs the
  business-account **acting-as** surface, which doesn't exist yet — that's a
  product decision for the premium-profiles / business specs, not a realtime
  addendum.
- **Explicitly not building:** a live analytics firehose, real-time order
  streams (no commerce backend yet), live chat widgets on business profiles.

## 9. Execution sequence

One branch + PR per phase, docs updated in the same PR (repo norm).

| Phase | Branch | Deliverable | Blocking on |
|---|---|---|---|
| **A. Backplane** | `realtime/phase-a-backplane` | ✅ **complete** — `bus.ts` + memory/Redis drivers, 4 pub/sub modules + presence refactored, Upstash provisioned, fan-out + self-healing presence + load spike all verified | — |
| **B. Mobile hardening** | `realtime/phase-b-mobile` | ✅ **complete** — AppState-gated SSE + backoff + `resync`; push suppressed while online; `useAppForeground` reconcile on feed + notifications. (`Last-Event-ID` replay moved to C) | A |
| **C. Community chat (mobile)** | `realtime/phase-c-community-chat` | ✅ v1 chat routes (history/send/stream/delete/typing), enriched events, `CommunityChatBody`, shared `createEventStream`, **`Last-Event-ID` replay**. ⏳ two-device pass (blocked on deploy) | A, B |
| **D. Voice rooms** | see [addendum-voice-rooms-livekit.md](addendum-voice-rooms-livekit.md) | ✅ D1 server + D2 web (LiveKit SFU, mesh removed). ⏳ D3 mobile | A |
| **E. Business signals** | `realtime/phase-e-business` | ✅ contact-message push (the one gap), `bizview` viewer count. Rest already pushed. Two-way business inbox deferred (needs acting-as surface) | A, B |

### Verification per phase
- `pnpm test` + `pnpm lint` + `pnpm build` (web), `jest` + `tsc` + root
  `lint` (mobile) green.
- The `build`-without-Redis-env check stays green through every phase.
- Manual two-device pass on any realtime surface the phase touches.
- Deploy-lag smoke test (memory `project_deploy_lag_smoke_test`) — verify
  live, not just `git push`.

## 10. Non-goals / guardrails

- **No managed realtime SaaS migration.** Ably/Pusher/Supabase Realtime were
  considered — they'd give presence, history, and battery-friendly mobile
  SDKs out of the box. Deferred because: every SSE route is already built,
  the backplane is ~200 lines, and a SaaS adds a second vendor + per-connection
  cost + a client rewrite. Revisit if concurrent connections pass ~10k or if
  Phase B's reconnect/replay proves fragile.
- **No WebSockets for chat.** SSE + POST is sufficient and simpler on Vercel.
- **Mobile SSE never runs in the background.** Push is the background channel.
- **Voice never rides the message bus.** LiveKit owns audio + its signaling.
- **Realtime stays an enhancement, not the source of truth** — the existing
  posture across all five modules. A dropped event = a refetch shows it.
- **Don't regress:** the Aug 2026 perf pass, `instrumentation.ts` in `src/`,
  the two-tier rate-limit split, the `next build` eager-secret rule.
- No schema change in Phase A. B adds a Redis-only replay buffer (no SQL). C
  reuses the existing community-chat tables. D/E get their own review.
