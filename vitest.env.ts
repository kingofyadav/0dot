import path from "node:path";

// Dedicated scratch DB, separate from prisma/dev.db, so running the test
// suite never touches real dev data. Fixed key below is a valid 32-byte
// base64 value used only for tests — never a real secret.
export const TEST_DB_PATH = path.resolve(__dirname, "prisma/vitest-test.db");
export const TEST_DATABASE_URL = `file:${TEST_DB_PATH}`;
export const TEST_MESSAGE_ENCRYPTION_KEY = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=";
// Fake, never-used-for-real-calls key so importing src/lib/stripe.ts (which
// eagerly constructs a Stripe client at module scope) doesn't throw just
// because a test transitively pulls in platform-billing.ts/payments.ts —
// nothing in the suite actually calls the Stripe API.
export const TEST_STRIPE_SECRET_KEY = "sk_test_vitest_fake_key_000000000000000000";
