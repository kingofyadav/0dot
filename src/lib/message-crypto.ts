import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// phase-2 spec §5.7: "message content encrypted at rest at minimum
// (column/table-level encryption)". Deliberately NOT end-to-end — the
// server holds the key and decrypts for display (inbox previews,
// conversation view), matching the spec's explicit E2E non-goal ("a
// substantial separate effort... deserves its own spec"). This protects
// against the DB file itself (or a backup/copy of it) being read directly;
// it does not protect against a compromised server process, which E2E
// would but isn't in scope here.
//
// AES-256-GCM: authenticated encryption, so a tampered or corrupted
// ciphertext throws on decrypt instead of silently returning garbage.
// Stored format is one self-describing string column (no schema change):
// base64(iv) + "." + base64(authTag) + "." + base64(ciphertext).

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce — the recommended/standard size for GCM
const KEY_LENGTH = 32; // 256-bit key

function getKey(): Buffer {
  const raw = process.env.MESSAGE_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "MESSAGE_ENCRYPTION_KEY is not set. Message content encryption at rest (phase-2 spec §5.7) requires it. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\" and set it in .env."
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `MESSAGE_ENCRYPTION_KEY must decode (base64) to ${KEY_LENGTH} bytes, got ${key.length} — generate a fresh one rather than hand-editing it.`
    );
  }
  return key;
}

export function encryptAtRest(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptAtRest(stored: string): string {
  const [ivB64, authTagB64, ciphertextB64] = stored.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted value — expected 'iv.authTag.ciphertext'.");
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}

// Message.body and Conversation.lastMessagePreview are both nullable
// (attachment-only messages) — null passes through untouched rather than
// every call site re-deriving this same null check.
export function encryptAtRestNullable(plaintext: string | null): string | null {
  return plaintext === null ? null : encryptAtRest(plaintext);
}

export function decryptAtRestNullable(stored: string | null): string | null {
  return stored === null ? null : decryptAtRest(stored);
}

// Display-path variant: a row encrypted under a since-rotated/lost key must
// not crash the page it's rendered on (inbox previews, conversation view).
// Write paths (encryptAtRest) deliberately keep throwing on a missing/wrong
// key — only already-stored, now-undecryptable data degrades gracefully.
const UNAVAILABLE_PLACEHOLDER = "[message unavailable]";

export function decryptAtRestNullableSafe(stored: string | null): string | null {
  if (stored === null) return null;
  try {
    return decryptAtRest(stored);
  } catch {
    return UNAVAILABLE_PLACEHOLDER;
  }
}
