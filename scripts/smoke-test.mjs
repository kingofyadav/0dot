#!/usr/bin/env node
// Post-deploy sanity check — added after a real incident (2026-08-26):
// mobile pro-upgrade addendum M13-M14 added new API routes (profiles/*/
// followers, /following, /unread-counts) and new fields on an existing one
// (conversations' isOnline/otherLastActiveAt) that the mobile app already
// shipped against, but the commit reached GitHub/Vercel later than the
// mobile build did. The gap surfaced as a client-side "JSON Parse error:
// Unexpected character: <" — Next's own 404 HTML page, returned with a
// 2xx-shaped body the client expected to be JSON — which looked exactly
// like an app bug until someone diffed origin/main against HEAD.
//
// This script re-creates that exact signature check for a short list of
// routes spanning the app's major feature areas: hit each one with no
// Authorization header and assert it responds 401 JSON (route exists,
// correctly rejects the missing token) rather than 404 HTML (route
// missing from this deployment) or 5xx (route present but broken). No
// fixtures or credentials needed — every route here runs its auth check
// before touching the DB, so an unauthenticated request never needs a
// real user/conversation/etc. to exist.
//
// Usage: node scripts/smoke-test.mjs [baseUrl]
//   BASE_URL env var or the first CLI arg overrides the default
//   (https://0dot.in). Exits non-zero if any check fails.

const BASE_URL = process.argv[2] ?? process.env.SMOKE_TEST_BASE_URL ?? "https://0dot.in";

const TIMEOUT_MS = 10_000;
const RETRIES = 3;
const RETRY_DELAY_MS = 5_000; // a Production deployment_status can fire a few seconds before the domain alias fully propagates

const JSON_API_CHECKS = [
  { path: "/api/v1/users/me" },
  { path: "/api/v1/feed" },
  { path: "/api/v1/notifications" },
  { path: "/api/v1/unread-counts" },
  { path: "/api/v1/messages/stream" },
  { path: "/api/v1/search?type=users&q=a" },
  // A fabricated username is fine — resolveApiRequest's auth check runs
  // (and fails) before either route ever looks the username up.
  { path: "/api/v1/profiles/smoke-test-nonexistent-user" },
  { path: "/api/v1/profiles/smoke-test-nonexistent-user/followers" },
  { path: "/api/v1/profiles/smoke-test-nonexistent-user/following" },
].map((check) => ({ ...check, expectStatus: 401, expectContentType: "application/json" }));

const CHECKS = [
  // Baseline: the site itself is up and serving HTML, not e.g. a build
  // failure's error page or a blank response.
  { path: "/", expectStatus: 200, expectContentType: "text/html" },
  // Marketing pages (redesign Phase 3) — static content, no auth, so a 200
  // here also catches a broken MarketingNav/MarketingFooter import.
  { path: "/about", expectStatus: 200, expectContentType: "text/html" },
  ...JSON_API_CHECKS,
];

// Optional authenticated check: everything above only proves a route
// exists and correctly *rejects* an unauthenticated request — it can't
// catch a bug that only breaks the authenticated path. This one logs in
// with a real (dedicated, low-privilege) session and confirms
// /api/messages/stream actually opens for a real user, not just that it
// 401s for an anonymous one — see scripts/mint-smoke-test-session.ts for
// how to provision SMOKE_TEST_SESSION_TOKEN. Skipped, not failed, when
// that secret isn't set, so this stays optional infrastructure rather than
// a new hard requirement for every environment running this script.
const SMOKE_TEST_SESSION_TOKEN = process.env.SMOKE_TEST_SESSION_TOKEN;

async function runAuthenticatedStreamCheck() {
  const path = "/api/messages/stream";
  const url = `${BASE_URL}${path}`;
  if (!SMOKE_TEST_SESSION_TOKEN) {
    return { ok: true, url, skipped: true };
  }

  let lastError;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: "manual",
        headers: { Cookie: `0dot_session=${SMOKE_TEST_SESSION_TOKEN}` },
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (res.status === 200 && contentType.includes("text/event-stream")) {
        // Confirm the stream actually sends bytes (the `retry: 2000\n\n`
        // preamble) rather than opening and immediately hanging/erroring —
        // then abort. Waiting for the stream to end would mean waiting out
        // its full recycle window, which isn't the point of a smoke test.
        const reader = res.body.getReader();
        const { value } = await reader.read();
        controller.abort();
        if (value && value.length > 0) return { ok: true, url };
        lastError = "stream opened (200, text/event-stream) but sent no bytes before timeout";
      } else {
        const body = await res.text();
        lastError = `expected 200 text/event-stream, got ${res.status} ${contentType || "(no content-type)"} — body starts: ${body.slice(0, 120).replace(/\s+/g, " ")}`;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < RETRIES) await sleep(RETRY_DELAY_MS);
  }
  return { ok: false, url, error: lastError };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOnce(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "manual" });
    // Reading the body confirms the response is actually well-formed
    // (catches a truncated stream, not just a status/header mismatch) —
    // it's small in every case here (a JSON error object or the HTML
    // shell), so buffering it fully is cheap.
    const text = await res.text();
    return { status: res.status, contentType: res.headers.get("content-type") ?? "", body: text };
  } finally {
    clearTimeout(timeout);
  }
}

async function runCheck(check) {
  const url = `${BASE_URL}${check.path}`;
  let lastError;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const { status, contentType, body } = await fetchOnce(url);
      const statusOk = status === check.expectStatus;
      const contentTypeOk = contentType.includes(check.expectContentType);
      if (statusOk && contentTypeOk) {
        return { ok: true, url };
      }
      lastError = `expected ${check.expectStatus} ${check.expectContentType}, got ${status} ${contentType || "(no content-type)"} — body starts: ${body.slice(0, 120).replace(/\s+/g, " ")}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (attempt < RETRIES) await sleep(RETRY_DELAY_MS);
  }
  return { ok: false, url, error: lastError };
}

async function main() {
  console.log(`Smoke-testing ${BASE_URL} (${CHECKS.length} checks)...\n`);

  const results = await Promise.all([...CHECKS.map(runCheck), runAuthenticatedStreamCheck()]);

  let failures = 0;
  for (const result of results) {
    if (result.skipped) {
      console.log(`  SKIP  ${result.url}\n        SMOKE_TEST_SESSION_TOKEN not set — authenticated check skipped.`);
    } else if (result.ok) {
      console.log(`  PASS  ${result.url}`);
    } else {
      failures++;
      console.log(`  FAIL  ${result.url}\n        ${result.error}`);
    }
  }

  console.log(`\n${results.length - failures}/${results.length} passed.`);
  if (failures > 0) {
    console.error(
      `\n${failures} check(s) failed. A 404/HTML response on a route that should require auth usually means this deployment is missing code that a client (mobile or web) already expects — check whether the latest commit actually reached this deployment.`
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
