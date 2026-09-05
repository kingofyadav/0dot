import { test, expect, type Page } from "@playwright/test";

// Post-build smoke test: loads every major public (no-auth) route in a real
// browser and fails if anything lands in the console as an error/warning, or
// throws an uncaught exception. This is the class of bug that unit tests and
// tsc/eslint structurally can't catch — a missing CSP allowlist entry, a
// broken hydration, a third-party script failing to load — because none of
// those show up as a build or type error, only as noise in a real visitor's
// devtools. Two real incidents shipped to production before anyone's
// console caught them: CSP silently blocking /feed's image uploads (fixed
// bc123ae) and CSP silently blocking /map's iframe (fixed 275acc9). This
// test exists so the next missing CSP entry fails CI instead.
//
// Scoped to unauthenticated routes only — logged-in routes need seeded
// session state this suite doesn't set up (see scripts/smoke-test.mjs for
// that pattern applied to API routes, including its optional authenticated
// check via SMOKE_TEST_SESSION_TOKEN).
const PUBLIC_ROUTES = [
  "/",
  "/about",
  "/login",
  "/signup",
  "/download",
  "/map",
  "/explore",
  "/trending",
  "/trust-safety",
  "/dmca",
  "/jobs",
];

// Genuinely benign messages only. Never add an entry here to make a real bug
// stop failing the build — each line needs a comment explaining why it's not
// actionable, same bar as Sentry's ignoreErrors in instrumentation-client.ts.
const IGNORED_MESSAGE_PATTERNS: RegExp[] = [
  // React's own dev-mode hint, not a warning about anything broken. Harmless
  // in production too if it ever appears (e.g. a misconfigured NODE_ENV).
  /Download the React DevTools/,
  // Chromium's software/virtualized GPU driver logging a slow readback on
  // /map's WebGL canvas — an artifact of running headless without real GPU
  // acceleration (CI, this sandbox), not a signal about app or map-tile
  // correctness. Confirmed 2026-09-05: reproduces on every /map load here,
  // never on real hardware.
  /GL Driver Message/,
];

function isIgnored(text: string): boolean {
  return IGNORED_MESSAGE_PATTERNS.some((pattern) => pattern.test(text));
}

function attachNoiseCollector(page: Page, noise: string[]): void {
  page.on("console", (msg) => {
    if (msg.type() !== "error" && msg.type() !== "warning") return;
    if (isIgnored(msg.text())) return;
    noise.push(`[console.${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    if (isIgnored(err.message)) return;
    noise.push(`[uncaught exception] ${err.message}`);
  });
}

for (const route of PUBLIC_ROUTES) {
  test(`${route} loads with no console noise`, async ({ page }) => {
    const noise: string[] = [];
    attachNoiseCollector(page, noise);

    const response = await page.goto(route, { waitUntil: "networkidle" });
    expect(response?.ok(), `${route} should respond 2xx`).toBeTruthy();

    // Give deferred hydration/effect-driven errors (e.g. a failed lazy
    // resource load) a moment to surface after the network goes idle.
    await page.waitForTimeout(500);

    expect(noise, noise.join("\n")).toEqual([]);
  });
}
