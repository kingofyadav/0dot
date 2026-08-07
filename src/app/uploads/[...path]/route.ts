import { stat } from "fs/promises";
import { createReadStream } from "fs";
import { Readable } from "stream";
import path from "path";

// Next's production server (next start) snapshots public/ into a fixed
// allowlist once at boot (setupFsCheck in next/dist/server/lib/router-utils/
// filesystem.js) and never rescans it — so files src/lib/uploads.ts writes
// to public/uploads/ at runtime (post-boot) 404 until the process restarts,
// even though they exist on disk. This route re-serves the same /uploads/*
// URLs dynamically, reading the filesystem fresh on every request, so posts
// don't need a server restart before their images show up.
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".epub": "application/epub+zip",
  ".webm": "audio/webm",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".txt": "text/plain",
};

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  // Filenames are always saveUploadedImage/saveMessageAttachment's own
  // randomBytes(16).hex output (see src/lib/uploads.ts) — reject anything
  // else rather than resolving it against the filesystem.
  const filename = segments.join("/");
  if (!/^[a-f0-9]{32}\.[a-z0-9]+$/.test(filename)) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = path.join(UPLOADS_DIR, filename);
  const stats = await stat(filePath).catch(() => null);
  if (!stats || !stats.isFile()) return new Response("Not found", { status: 404 });

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
  const webStream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stats.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
