import { execSync } from "node:child_process";
import fs from "node:fs";
import { TEST_DB_PATH, TEST_DATABASE_URL } from "./vitest.env";

export default async function setup() {
  fs.rmSync(TEST_DB_PATH, { force: true });
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });

  return () => {
    fs.rmSync(TEST_DB_PATH, { force: true });
    fs.rmSync(`${TEST_DB_PATH}-journal`, { force: true });
  };
}
