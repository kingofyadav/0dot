import { defineConfig } from "@playwright/test";

// Runs against a production build (`next start`), not `next dev` — dev mode
// skips the real CSP header from proxy.ts and short-circuits some
// hydration paths, which would hide exactly the class of bug this suite
// exists to catch (see e2e/console-noise.spec.ts).
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "html",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    // `npm run build` must already have run — this reuses that output
    // rather than rebuilding, so CI doesn't pay for the same build twice.
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
