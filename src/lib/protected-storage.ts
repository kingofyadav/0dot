import "server-only";
import { randomBytes, createHmac, timingSafeEqual } from "crypto";
import { put, get } from "@vercel/blob";

// spec §5.3: files are never served from a permanently public URL. Stored
// as Vercel Blob objects with access:"private" under a protected/ prefix
// (same store as src/lib/uploads.ts's public tier, BLOB_READ_WRITE_TOKEN
// already covers both — access is a per-object property, not a
// per-store one) — private objects require an authenticated get() call,
// so there's no static URL that can ever serve these directly; the only
// path in is /api/downloads/[token] after a signed-token + DB-purchase
// check (issueDownloadToken/streamProtectedFile below).
//
// Previously written to storage/protected/ on local disk via fs — broken
// on Vercel, whose Node.js Functions have a read-only filesystem outside
// /tmp, and no cross-invocation persistence even there. Every digital
// product / course lesson / podcast episode / gated published-file upload
// was failing (or silently vanishing) in production until this moved to
// Blob, same root cause the "Fix broken file uploads" commit already fixed
// for the public tier in src/lib/uploads.ts.
const PROTECTED_PREFIX = "protected/";

const ALLOWED_PROTECTED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/epub+zip": "epub",
  "image/png": "png",
  "image/jpeg": "jpg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "text/plain": "txt",
};

export type ProtectedFileResult = { key: string; mimeType: string; sizeBytes: number } | { error: string };

// Shared by digital-product files (src/app/actions/digital-products.ts) and
// course lesson video/download content (src/app/actions/courses.ts) — one
// gated-upload pipeline, same "one upload path per storage tier" posture
// src/lib/uploads.ts already established for the public tier.
export async function saveProtectedFile(file: File, { maxBytes }: { maxBytes: number }): Promise<ProtectedFileResult> {
  const ext = ALLOWED_PROTECTED_TYPES[file.type];
  if (!ext) return { error: "Unsupported file type." };
  if (file.size > maxBytes) return { error: `Files must be ${Math.floor(maxBytes / (1024 * 1024))}MB or smaller.` };

  const key = `${PROTECTED_PREFIX}${randomBytes(16).toString("hex")}.${ext}`;
  try {
    await put(key, file, { access: "private", addRandomSuffix: false });
  } catch (err) {
    // Previously unguarded — any Blob API error (misconfigured
    // BLOB_READ_WRITE_TOKEN, a transient outage) propagated uncaught out of
    // the calling Server Action into a hard HTTP 500 instead of the
    // {error: string} shape createProduct/updateProduct (and courses.ts's
    // lesson upload) already know how to render as a normal form error.
    console.error("saveProtectedFile: blob put() failed", err);
    return { error: "Upload failed. Please try again." };
  }
  return { key, mimeType: file.type, sizeBytes: file.size };
}

// `key` only ever comes from saveProtectedFile's own randomBytes output,
// stored server-side in DigitalProduct.fileKey/Lesson.fileKey — never
// accepted as raw client input — but this shape check is a cheap second
// line of defense (and now the only thing standing between an unexpected
// key and an authenticated Blob fetch) if that assumption is ever violated
// by a future caller.
function isValidProtectedKey(key: string): boolean {
  return /^protected\/[a-f0-9]{32}\.[a-z0-9]+$/.test(key);
}

// No app-wide signing secret exists elsewhere in this codebase (sessions
// are opaque random tokens looked up in the DB, src/lib/session.ts — never
// HMAC-signed) — this is the first feature that needs one, since a
// download token must be verifiable without a DB round trip on every byte
// range request. Falls back to a fixed dev-only value so local development
// works without extra setup; a hardcoded fallback secret is a forgeable-
// token vulnerability if it's ever reachable in production (anyone who's
// read this file's source can mint a valid token for any resource/user),
// so — same "throw rather than silently degrade" posture as
// message-crypto.ts's MESSAGE_ENCRYPTION_KEY — production refuses to start
// without a real one instead of quietly falling back to it.
const TOKEN_SECRET = (() => {
  const secret = process.env.DOWNLOAD_TOKEN_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("DOWNLOAD_TOKEN_SECRET is not configured. Refusing to serve gated downloads with no real secret in production.");
  }
  return "dev-only-insecure-download-secret-DO-NOT-USE-IN-PRODUCTION-set-DOWNLOAD_TOKEN_SECRET";
})();

type DownloadTokenPayload = {
  // phase-7 spec §7.2: a fourth resourceType rather than a second gated-
  // delivery pipeline — private/unlisted PublishedFile rows reuse this
  // exact mechanism (see /api/downloads/[token]'s published_file branch).
  resourceType: "digital_product" | "lesson" | "podcast_episode" | "published_file";
  resourceId: string;
  userId: string;
  exp: number;
};

function sign(body: string): string {
  return createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
}

// spec §5.3/§5.4: short-lived (10 min) and buyer-scoped — the userId is
// baked into the signed payload, so a forwarded/leaked URL only works for
// as long as the token is valid, and re-verifying the purchase row at
// request time (see the /api/downloads/[token] route) is what actually
// enforces "only this buyer," not the token alone.
export function issueDownloadToken(payload: Omit<DownloadTokenPayload, "exp">, ttlSec = 600): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlSec * 1000 })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyDownloadToken(token: string): DownloadTokenPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expectedSigBuf = Buffer.from(sign(body));
  const sigBuf = Buffer.from(sig);
  if (sigBuf.length !== expectedSigBuf.length || !timingSafeEqual(sigBuf, expectedSigBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as DownloadTokenPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\- ]/g, "_").slice(0, 120) || "download";
}

// Range-aware (needed for course video scrubbing, not just flat digital
// downloads — spec §11 reuses this same route for lesson content). The
// incoming Range header is forwarded through to get()'s `headers` option;
// contentRange below mirrors whatever the origin returns. NOTE: Vercel's
// own docs only demonstrate Range support against a blob's direct public
// URL (curl -r against *.public.blob.vercel-storage.com); get()'s typed
// result only ever reports statusCode 200 or 304, never 206 — so range
// passthrough on the *private* get() path used here is unconfirmed. Worst
// case this silently falls back to returning the full file on every seek
// (still correct playback, just no bandwidth savings) rather than
// breaking — a real improvement over the prior local-disk implementation,
// which didn't work in production at all, but worth verifying with a real
// range request against a deployed course video before assuming this
// matches the old byte-range behavior exactly.
// `disposition: "inline"` lets a <video>/<audio> element play the response
// directly instead of triggering a browser download prompt.
export async function streamProtectedFile(
  key: string,
  mimeType: string,
  downloadName: string,
  request: Request,
  disposition: "attachment" | "inline" = "attachment"
): Promise<Response> {
  if (!isValidProtectedKey(key)) return new Response("Not found", { status: 404 });

  const range = request.headers.get("range");
  const result = await get(key, {
    access: "private",
    headers: range ? { range } : undefined,
  }).catch(() => null);
  if (!result || result.statusCode !== 200) return new Response("Not found", { status: 404 });

  const contentDisposition = `${disposition}; filename="${sanitizeFilename(downloadName)}"`;
  const contentRange = result.headers.get("content-range");
  const contentLength = result.headers.get("content-length") ?? String(result.blob.size);

  return new Response(result.stream, {
    status: contentRange ? 206 : 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": contentLength,
      "Accept-Ranges": "bytes",
      ...(contentRange ? { "Content-Range": contentRange } : {}),
      "Content-Disposition": contentDisposition,
      "Cache-Control": "private, no-store",
    },
  });
}
