# Addendum — Voice Rooms on LiveKit (Realtime Phase D)

Status: **D1 (server) + D2 (web) + D3 (mobile) code-complete 2026-08-29.**
LiveKit already provisioned (Preview + Prod) and verified working from a
local smoke. Pending: the mobile **dev-client rebuild** (native LiveKit
module) and a live two-participant audio pass on a preview deploy.
Owner: TBD
Related: [addendum-realtime-community.md](addendum-realtime-community.md) §7 ·
[phase-3-communities.md](phase-3-communities.md) §12 ·
[phase-5-creator-platform.md](phase-5-creator-platform.md) §8 (livestreams —
already on LiveKit) · [../foundations/MOBILE.md](../foundations/MOBILE.md)

## 1. Purpose & Scope

Community voice rooms (`VoiceRoom` / `VoiceRoomParticipant`, `src/app/actions/
voice-rooms.ts`, `src/app/c/[slug]/voice/`) ship today on a **mesh WebRTC**
transport: the current speaker's browser opens one `RTCPeerConnection` per
listener, signaling relayed through the app's own SSE stream
(`sendVoiceSignal` → `voice-signal-events.ts`'s `sendSignal`), STUN-only, no
TURN. `VoiceRoomView.tsx` documents the consequences in its own comments: a
30-participant hard cap ("the current speaker's upload bandwidth scales with
room size"), participants behind symmetric NAT / corporate firewalls simply
fail to connect, and a dropped audio leg requires "leave and rejoin to
reconnect". There is **no mobile voice UI at all**.

**LiveKit is already integrated** for livestreams (Phase 5):
`src/lib/livestream-provider.ts` has `LiveKitLivestreamProvider`
(`RoomServiceClient`) and `createLiveKitToken`; `livekit-client` +
`livekit-server-sdk` are deps; `src/proxy.ts`'s CSP already allows the
LiveKit connect host; `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`
are provisioned on Vercel (Preview + Production) and verified working from a
local smoke.

**This phase swaps the voice room's audio transport to that same LiveKit
SFU**, on web and (newly) mobile, and keeps **everything else unchanged** —
the `VoiceRoom` schema, the FIFO "request to speak → wait your turn → press
the button" floor model (`voice-rooms.ts`), every `voice-rooms.ts` action's
auth/membership/ban logic, and the `voice:<roomId>` SSE broadcast that keeps
open clients' room-state in sync (Phase A made it cross-instance-safe).

**In scope:** LiveKit room lifecycle per `VoiceRoom`; server-enforced
publish permission that follows the floor; the web view rewritten on
`livekit-client`; a mobile voice-room screen on `@livekit/react-native`;
removal of the mesh signaling path; cost guards.
**Out of scope:** recording (`VoiceRoom.isRecorded` etc. exist in the schema
from Phase 8 but no producer is wired — leave it that way; recording has its
own consent/retention policy work); video; screen share; spatial audio;
raising the "one speaker at a time" model to a panel/multi-speaker format
(a deliberate product choice — see `voice-rooms.ts`).

## 2. Constraints that shape this work

- **Reuse `createLiveKitToken`** (`livestream-provider.ts`) — don't mint a
  second AccessToken path. The room-lifecycle + permission-sync helpers are
  new (`src/lib/voice-livekit.ts`), the token helper is shared.
- **The floor is the source of truth, not the LiveKit permission.** Tokens
  are minted `canPublish` = "does this user hold a fresh floor *right now*";
  every floor transition (`startSpeaking` / `stopSpeaking` /
  `forceStopSpeaker` / leave-while-speaking / ban) also calls
  `RoomServiceClient.updateParticipant` to grant/revoke publish live. Both,
  so a mid-turn reconnect keeps publishing and a stale client can't.
- **`MAX_FLOOR_HOLD_MS` (60s) stays** the server-side fallback release for a
  speaker whose client never sends `stopSpeaking` — now it also needs to
  revoke the LiveKit publish grant, not just clear `currentSpeakerId`.
- **Mobile needs a dev-client rebuild** — `@livekit/react-native` +
  `@livekit/react-native-webrtc` + the `@config-plugins/react-native-webrtc`
  Expo config plugin are native modules (memory
  `project_m12_account_mgmt_devclient_crash`). Plus mic permission strings
  and background-audio mode.
- **LiveKit's Vercel env vars are "Sensitive"** — `vercel env pull` can't
  retrieve them; they only exist in a deploy or in `.env` locally (where
  they are, and work). Live end-to-end testing is on a preview/prod deploy,
  same as Phase C's device pass.
- **`next build` eager-secret rule** — `voice-livekit.ts` reads
  `LIVEKIT_*` lazily (a build with no creds must compile; without them the
  feature degrades to "voice isn't configured", never a throw).

## 3. Phase D1 — Server (LiveKit lifecycle + permission + cleanup)

### 3.1 `src/lib/voice-livekit.ts` (new)

- `voiceRoomLkName(roomId)` → `"voiceroom_<roomId>"`.
- `ensureVoiceRoom(roomId)` — idempotent `RoomServiceClient.createRoom({
  name, emptyTimeout: 300, maxParticipants: MAX_VOICE_ROOM_PARTICIPANTS,
  departureTimeout: 20 })`. No-op without creds.
- `closeVoiceRoom(roomId)` — `deleteRoom(name)`, swallow not-found.
- `mintVoiceRoomToken({ roomId, userId, name, canPublish })` — thin wrapper
  over `createLiveKitToken` with the voice room name.
- `setVoicePublish(roomId, userId, canPublish)` — `updateParticipant(name,
  userId, { permission: { canPublish, canSubscribe: true, canPublishData:
  false } })`. Swallows the not-found that happens when the user holds the
  floor but isn't connected to LiveKit (their token already gates them; the
  60s floor timeout is the backstop).
- `kickFromVoiceRoom(roomId, userId)` — `removeParticipant(name, userId)`
  for the ban path.

### 3.2 Wire into `voice-rooms.ts`

| Action | Added LiveKit call |
|---|---|
| `createVoiceRoom` (live) / `startVoiceRoom` | `ensureVoiceRoom` + concurrent-room cap (§3.4) |
| `endVoiceRoom` | `closeVoiceRoom` |
| `startSpeaking` | `setVoicePublish(room, me, true)` + `setVoicePublish(room, prevSpeaker, false)` |
| `stopSpeaking` | `setVoicePublish(room, me, false)` |
| `forceStopSpeaker` | `setVoicePublish(room, speaker, false)` |
| `leaveVoiceRoom` (while speaking) | `setVoicePublish(room, me, false)` |
| `evictBannedUserFromVoiceRooms` | `kickFromVoiceRoom` + `setVoicePublish(false)` |

All LiveKit calls are `.catch`-logged best-effort — a LiveKit hiccup must
not fail the DB transaction that is the real floor state.

### 3.3 Remove the mesh signaling path

- Delete `sendVoiceSignal` (`voice-rooms.ts`).
- `voice-signal-events.ts` → drop `sendSignal`, the `{type:"signal"}` event
  variant, and the two-level `voice:<roomId>:<userId>` channel keying.
  `subscribeToVoiceRoom(roomId, cb)` loses its `userId` arg. Rename file to
  `voice-room-events.ts`.
- The SSE stream route (`api/c/[slug]/voice/[roomId]/stream`) keeps carrying
  only `{type:"room-updated"}`. Its participant-gate can relax to the same
  visibility gate chat's stream uses (it no longer carries network info) —
  but keep participant-gating for now; it's not wrong, just stricter.
- `NEXT_PUBLIC_VOICE_STUN_URLS` and the `ICE_SERVERS` block in
  `VoiceRoomView.tsx` go away (LiveKit Cloud provides TURN).

### 3.4 Cost guards

- `MAX_VOICE_ROOM_PARTICIPANTS`: 30 → **100** (SFU; the mesh reason is gone).
  LiveKit room `maxParticipants` matches.
- `emptyTimeout: 300` — LiveKit auto-closes the room 5 min after the last
  participant leaves.
- **`MAX_CONCURRENT_VOICE_ROOMS_PER_COMMUNITY` = 3** — checked in
  `createVoiceRoom` / `startVoiceRoom` (count `status: "live"` rooms).
- LiveKit `room_finished` webhook (§3.5) reconciles a room LiveKit closed
  (empty timeout, or `deleteRoom`) back to `status: "ended"` in the DB.

### 3.5 `POST /api/webhooks/livekit` (new)

`WebhookReceiver` (livekit-server-sdk) verifies the `Authorization` header.
On `room_finished` for a `voiceroom_*` room whose DB row is still not
`ended` → set `ended`, clear the speaker, `broadcastRoomUpdate`. Ignore
every other event and non-voice rooms (livestreams have their own lifecycle).
Register the webhook URL in the LiveKit project settings (manual, one-time —
noted in §7).

### 3.6 Verification — DONE

- `voice-rooms.test.ts` extended: `startVoiceRoom` refuses at the
  concurrent-room cap; `startSpeaking → stopSpeaking` moves the floor. The
  existing membership/ban tests stay green. (LiveKit helpers no-op under
  test — vitest forces `LIVEKIT_*` empty.)
- New `src/lib/realtime/__tests__/voice-livekit.test.ts` — name mapping,
  every helper a safe no-op without creds.
- **Live smoke against real LiveKit** (`.env` has working creds):
  `ensureVoiceRoom` (idempotent, `maxParticipants: 100`, `emptyTimeout: 300`)
  → token mint → `updateParticipant` on a non-connected identity throws
  (confirmed swallowed) → `deleteRoom` (handles double-delete). ✅
- `pnpm test` (74) + `pnpm lint` + `pnpm build` green. Build compiles
  without `LIVEKIT_*` (lazy reads, stub fallback).

## 4. Phase D2 — Web (`VoiceRoomView.tsx` on `livekit-client`) — DONE

- `requestVoiceRoomToken(roomId)` action (`voice-rooms.ts`) — verifies the
  caller is a participant + active member, mints via `mintVoiceRoomToken`
  with `canPublish = holdsFreshFloor(room, user)`.
- `VoiceRoomView.tsx` rewritten: the entire mesh block (~230 lines —
  `RTCPeerConnection` map, `connectToPeer`, `handleSignal`, `monitorConnection`,
  the four teardown effects, `ICE_SERVERS`) replaced by a `livekit-client`
  `Room`:
  - `room.connect(url, token)` on becoming a participant; `disconnect()` on
    leave/unmount. Keyed on `isParticipant`/`roomId` only — a floor change
    never re-connects.
  - `RoomEvent.TrackSubscribed` → `track.attach()` (detached autoplay
    `<audio>`) for every remote audio track.
  - A separate effect keyed on `currentSpeakerId === me` toggles
    `localParticipant.setMicrophoneEnabled(...)` — the server already
    granted/revoked the LiveKit publish permission, this is the local
    capture side. The 60s client auto-stop timer moved into `enableMic`.
  - Mic-permission / connection errors surface as before.
- The room-state SSE effect (`router.refresh()` on `room-updated`) is
  unchanged bar dropping the `signal` branch.

## 5. Phase D3 — Mobile (`@livekit/react-native`) — CODE COMPLETE

- **Deps** installed via `npx expo install`: `@livekit/react-native`,
  `@livekit/react-native-webrtc`, `@config-plugins/react-native-webrtc`
  (the plugin auto-added itself to `app.json`).
- **`app.json`**: `@config-plugins/react-native-webrtc` with a
  `microphonePermission` string; iOS `NSMicrophoneUsageDescription` +
  `UIBackgroundModes: ["audio"]`; Android `RECORD_AUDIO`,
  `MODIFY_AUDIO_SETTINGS`, `FOREGROUND_SERVICE`,
  `FOREGROUND_SERVICE_MICROPHONE`. `expo config --type introspect` confirms
  the plugin resolves and every permission lands.
- **Shared action helpers** — `src/lib/voice-room-actions.ts` (new): the
  floor transitions extracted as `(userId, roomId) => VoiceActionResult`
  (never throw for a business rule). The `"use server"` wrappers in
  `voice-rooms.ts` are now thin (`requireVerifiedUser` → delegate); the
  bearer route runs the identical logic. Same split `notifications.ts` uses.
- **v1 routes** under `communities/[slug]/voice/`:
  - `GET …/voice` — non-ended rooms; `POST …/voice` — `createLiveVoiceRoom`.
  - `GET …/voice/[roomId]` — the full snapshot the screen renders (mirrors
    the web `page.tsx` computation).
  - `POST …/voice/[roomId]/token` — `mintTokenForParticipant`.
  - `POST …/voice/[roomId]/action` — `{ action }` dispatching to the shared
    helpers.
  - `GET …/voice/[roomId]/stream` — bearer SSE (`room-updated` only).
  - Scopes: `communities:read` / `communities:write` (unchanged — the
    descriptions already name chat; voice is the same grain).
- **`mobile/src/screens/VoiceRoomBody.tsx`** + `app/community/[slug]/voice.tsx`
  (list + inline "Start a room") + `app/community/[slug]/voice/[roomId].tsx`
  + a **Voice** button on the community screen (row is now Join / Chat /
  Voice). `registerGlobals()` (module-guarded), `AudioSession.start/stop`
  around the screen's lifetime, a `livekit-client` `Room` connected while a
  participant + live + foregrounded, mic toggled to follow
  `currentSpeakerId === me`, room-state refetched on `room-updated` /
  `resync` via `createVoiceRoomStream` (a `createEventStream` wrapper). 60s
  client auto-stop timer.
- Tests: `VoiceRoomBody.test.tsx` (mocked LiveKit — load → request floor →
  live refetch → teardown; non-participant Join), `voice-livekit.test.ts`,
  `voice-rooms.test.ts` extended (`createLiveVoiceRoom`, `endVoiceRoom`,
  cost cap, floor). Web 76 + mobile 72 tests, both `tsc`, lint, `next build`.

**Pending:** the **dev-client rebuild** (`@livekit/react-native-webrtc` is a
native module) and a two-participant live-audio pass on a preview deploy —
the LiveKit client creds can't be pulled locally.

## 6. Execution sequence

| Increment | Branch | Deliverable | Blocking on |
|---|---|---|---|
| **D1 server** | `realtime/phase-d-voice-livekit` | ✅ `voice-livekit.ts`, floor→publish sync, mesh removal (`voice-signal-events.ts`→`voice-room-events.ts`, `sendVoiceSignal` deleted), cost guards, `/api/webhooks/livekit` | — |
| **D2 web** | (same branch) | ✅ `VoiceRoomView` on `livekit-client`, `requestVoiceRoomToken` | D1 |
| **D3 mobile** | `realtime/phase-d3-voice-mobile` | ✅ code — shared action helpers, v1 routes, `VoiceRoomBody` + list + entry, native deps + config. ⏳ dev-client rebuild + device audio pass | D1 |

Live end-to-end (two participants, floor hand-off, mobile) is verified on a
preview deploy after each increment — the LiveKit creds aren't pullable
locally for the client side, though D1's server calls are smoke-tested
locally against real LiveKit.

## 7. Non-goals / guardrails

- No recording — the schema fields stay dormant.
- No change to the FIFO one-speaker floor model.
- LiveKit calls never block the DB write that is the real floor state.
- Keep `createLiveKitToken` as the single token path (voice + livestream).
- Reuse `voice:<roomId>` for room state — don't put room state on LiveKit
  data channels (it must reach clients that haven't joined LiveKit yet, e.g.
  a listener still on the "Join room" screen).
- One-time manual step: register `…/api/webhooks/livekit` in the LiveKit
  project's webhook settings.
