import path from "path";

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
  const filename = segments.join("/");

  // Keep random hex filename validation check
  if (!/^[a-f0-9]{32}\.[a-z0-9]+$/.test(filename)) {
    return new Response("Not found", { status: 404 });
  }

  const blobUrl = `https://o39zy3hzq5ymzszy.public.blob.vercel-storage.com/uploads/${filename}`;

  return Response.redirect(blobUrl, 307);
}