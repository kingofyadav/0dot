export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const filename = segments.join("/");

  // Keep random hex filename validation check
  if (!/^[a-f0-9]{32}\.[a-z0-9]+$/.test(filename)) {
    return new Response("Not found", { status: 404 });
  }

  const blobUrl = `https://k82rdlknd7r0iore.public.blob.vercel-storage.com/uploads/${filename}`;

  return Response.redirect(blobUrl, 307);
}