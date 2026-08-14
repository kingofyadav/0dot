import path from "node:path";
import { defineConfig } from "vitest/config";
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
    // Every test file shares the one SQLite file created by global setup —
    // running files in parallel would race on it.
    fileParallelism: false,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      MESSAGE_ENCRYPTION_KEY: TEST_MESSAGE_ENCRYPTION_KEY,
      STRIPE_SECRET_KEY: TEST_STRIPE_SECRET_KEY,
      NODE_ENV: "test",
    },
  },
});
