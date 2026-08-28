#!/usr/bin/env node
// Realtime backplane load spike — docs/specs/addendum-realtime-community.md §4.6.
//
// The question this answers: can Upstash pub/sub via @upstash/redis
// (one `PSUBSCRIBE rt:*` per instance, the shape driver-redis.ts uses)
// carry the app's SSE fan-out, or do we need the node-redis-over-TCP
// fallback?
//
// It simulates N Vercel instances, each holding ONE pattern-subscribe
// connection (exactly as driver-redis.ts does — one upstream connection
// per instance regardless of user/room count), then fires a burst of
// publishes from a separate REST client and checks that EVERY instance
// received EVERY message, plus end-to-end latency.
//
// Usage:  node scripts/realtime-load-spike.mjs [instances] [messages] [ratePerSec]
//   defaults: 8 instances, 500 messages, 100/s
//
// Reads KV_REST_API_URL / KV_REST_API_TOKEN from the environment (run after
// `vercel env pull .env.local` and `set -a; . ./.env.local; set +a`, or
// prefix with the vars).

import { Redis } from "@upstash/redis";

const INSTANCES = Number(process.argv[2] ?? 8);
const MESSAGES = Number(process.argv[3] ?? 500);
const RATE = Number(process.argv[4] ?? 100);
const PREFIX = "rt:";
const CHANNELS = ["msg:u-1", "msg:u-2", "cchat:c-1", "lchat:l-1", "voice:r-1:u-9"];

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error("KV_REST_API_URL / KV_REST_API_TOKEN not set — see the header comment.");
  process.exit(2);
}
const cfg = { url, token, automaticDeserialization: false };

console.log(
  `spike: ${INSTANCES} instances · ${MESSAGES} messages · ${RATE}/s · host ${new URL(url).host}\n`
);

// ── Subscribers: one pattern-subscribe per simulated instance ───────────
const received = Array.from({ length: INSTANCES }, () => new Map()); // seq -> recvTime
const subs = [];
for (let i = 0; i < INSTANCES; i++) {
  const sub = new Redis(cfg).psubscribe(`${PREFIX}*`);
  sub.on("pmessage", ({ message }) => {
    const { seq, t } = JSON.parse(message);
    received[i].set(seq, Date.now() - t);
  });
  sub.on("error", (e) => console.error(`instance ${i} sub error`, e?.message ?? e));
  subs.push(sub);
}
await new Promise((r) => setTimeout(r, 2500)); // let subscriptions establish

// ── Publisher: a burst at the target rate from one REST client ──────────
const publisher = new Redis(cfg);
const gapMs = 1000 / RATE;
const started = Date.now();
for (let seq = 0; seq < MESSAGES; seq++) {
  const channel = CHANNELS[seq % CHANNELS.length];
  publisher
    .publish(`${PREFIX}${channel}`, JSON.stringify({ seq, t: Date.now() }))
    .catch((e) => console.error("publish fail", seq, e?.message ?? e));
  await new Promise((r) => setTimeout(r, gapMs));
}
const publishWall = Date.now() - started;

// ── Settle, then score ─────────────────────────────────────────────────
await new Promise((r) => setTimeout(r, 4000));
await Promise.all(subs.map((s) => s.unsubscribe().catch(() => {})));

let totalMissing = 0;
const allLatencies = [];
received.forEach((m, i) => {
  const missing = MESSAGES - m.size;
  totalMissing += missing;
  for (const l of m.values()) allLatencies.push(l);
  if (missing) console.log(`  instance ${i}: MISSING ${missing}/${MESSAGES}`);
});
allLatencies.sort((a, b) => a - b);
const pct = (p) => allLatencies[Math.floor((allLatencies.length - 1) * p)] ?? 0;

console.log(`\npublish wall time:   ${publishWall}ms (target ${Math.round((MESSAGES / RATE) * 1000)}ms)`);
console.log(`delivery completeness: ${(((INSTANCES * MESSAGES - totalMissing) / (INSTANCES * MESSAGES)) * 100).toFixed(2)}%  (${totalMissing} missed of ${INSTANCES * MESSAGES})`);
console.log(`latency ms  p50 ${pct(0.5)}  p90 ${pct(0.9)}  p99 ${pct(0.99)}  max ${allLatencies.at(-1) ?? 0}`);

const pass = totalMissing === 0 && pct(0.99) < 2000;
console.log(pass ? "\n✅ PASS — Upstash pub/sub carries this load" : "\n❌ FAIL — consider the node-redis TCP fallback (spec §4.3)");
process.exit(pass ? 0 : 1);
