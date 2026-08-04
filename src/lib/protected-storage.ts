import "server-only";
import { randomBytes, createHmac, timingSafeEqual } from "crypto";
import { mkdir, writeFile, stat } from "fs/promises";
import { createReadStream } from "fs";
import { Readable } from "stream";
import path from "path";

// spec §5.3: files are never served from a permanently public URL. Written
// to storage/protected/ (project-root-relative, outside public/ — see
// .gitignore) instead of public/uploads (src/lib/uploads.ts's directory),
// so there's no static route that can ever serve these directly; the only
// path in is /api/downloads/[token] after a signed-token + DB-purchase
// check (issueDownloadToken/streamProtectedFile below).
const PROTECTED_DIR = path.join(process.cwd(), "storage", "protected");

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

  await mkdir(PROTECTED_DIR, { recursive: true });
  const key = `${randomBytes(16).toString("hex")}.${ext}`;
  await writeFile(path.join(PROTECTED_DIR, key), Buffer.from(await file.arrayBuffer()));
  return { key, mimeType: file.type, sizeBytes: file.size };
}

// `key` only ever comes from saveProtectedFile's own randomBytes output,
// stored server-side in DigitalProduct.fileKey/Lesson.fileUrl — never
// accepted as raw client input — but this shape check is a cheap second
// line of defense against path traversal if that assumption is ever
// violated by a future caller.
function protectedFilePath(key: string): string {
  if (!/^[a-f0-9]{32}\.[a-z0-9]+$/.test(key)) throw new Error("Invalid protected file key.");
  return path.join(PROTECTED_DIR, key);
}

// No app-wide signing secret exists elsewhere in this codebase (sessions
// are opaque random tokens looked up in the DB, src/lib/session.ts — never
// HMAC-signed) — this is the first feature that needs one, since a
// download token must be verifiable without a DB round trip on every byte
// range request. Falls back to a fixed dev-only value so local development
// works without extra setup; loudly not safe for a real deployment, same
// "flag it, don't silently pretend it's production-grade" posture as
// StubPaymentProcessor.
const TOKEN_SECRET =
  process.env.DOWNLOAD_TOKEN_SECRET ??
  "dev-only-insecure-download-secret-DO-NOT-USE-IN-PRODUCTION-set-DOWNLOAD_TOKEN_SECRET";

type DownloadTokenPayload = {
  resourceType: "digital_product" | "lesson" | "podcast_episode";
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
// downloads — spec §11 reuses this same route for lesson content).
// `disposition: "inline"` lets a <video>/<audio> element play the response
// directly instead of triggering a browser download prompt.
export async function streamProtectedFile(
  key: string,
  mimeType: string,
  downloadName: string,
  request: Request,
  disposition: "attachment" | "inline" = "attachment"
): Promise<Response> {
  const filePath = protectedFilePath(key);
  const stats = await stat(filePath).catch(() => null);
  if (!stats) return new Response("Not found", { status: 404 });

  const fileSize = stats.size;
  const contentDisposition = `${disposition}; filename="${sanitizeFilename(downloadName)}"`;
  const range = request.headers.get("range");

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? parseInt(match[1], 10) : 0;
    const end = match?.[2] ? parseInt(match[2], 10) : fileSize - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end >= fileSize) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${fileSize}` } });
    }
    const webStream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
    return new Response(webStream, {
      status: 206,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Disposition": contentDisposition,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const webStream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(fileSize),
      "Accept-Ranges": "bytes",
      "Content-Disposition": contentDisposition,
      "Cache-Control": "private, no-store",
    },
  });
}
