import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { TEST_DATABASE_URL, TEST_MESSAGE_ENCRYPTION_KEY, TEST_STRIPE_SECRET_KEY } from "./vitest.env";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["./vitest.global-setup.ts"],
    setupFiles: ["./src/test/setup.ts"],
    // mobile/ has its own Jest suite (jest-expo preset, run via `npm test`
    // inside mobile/) — without this, vitest's default include pattern
    // still picks up mobile/src/**/__tests__/*.test.ts (it's not under
    // mobile/node_modules, vitest's only default exclude that would apply)
    // and fails trying to run Jest-specific mocking APIs under vitest.
    // e2e/ is Playwright's suite (run via `npm run test:e2e`), which
    // registers its own global `test()` — vitest's default include pattern
    // matches its *.spec.ts files too and errors calling test() outside a
    // Playwright run.
    exclude: [...configDefaults.exclude, "mobile/**", "e2e/**"],
    // Every test file shares the one SQLite file created by global setup —
    // running files in parallel would race on it.
    fileParallelism: false,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      MESSAGE_ENCRYPTION_KEY: TEST_MESSAGE_ENCRYPTION_KEY,
      STRIPE_SECRET_KEY: TEST_STRIPE_SECRET_KEY,
      NODE_ENV: "test",
      // Vite loads .env / .env.local into the test process, which carry real
      // Upstash + LiveKit creds — force them empty so the realtime bus uses
      // the in-memory driver and the voice-room LiveKit helpers
      // (src/lib/voice-livekit.ts) no-op instead of hitting the network.
      KV_REST_API_URL: "",
      UPSTASH_REDIS_REST_URL: "",
      LIVEKIT_URL: "",
      LIVEKIT_API_KEY: "",
      LIVEKIT_API_SECRET: "",
    },
  },
});
