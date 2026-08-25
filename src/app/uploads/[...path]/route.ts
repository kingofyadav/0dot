export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const filename = segments.join("/");

  // Keep random hex filename validation check
  if (!/^[a-f0-9]{32}\.[a-z0-9]+$/.test(filename)) {
    // A bare `new Response("Not found", {status: 404})` here rendered as raw
    // unstyled plaintext — a Route Handler has no access to the app's
    // not-found.tsx boundary the way a page does. Redirecting into a
    // guaranteed-unmatched app path gets the real branded not-found UI
    // (wrapped in RootLayout, same as every other 404 in the app) for the
    // uncommon case this is opened directly rather than as an <img src>.
    return Response.redirect(new URL("/missing-file", request.url), 307);
  }

  const blobUrl = `https://k82rdlknd7r0iore.public.blob.vercel-storage.com/uploads/${filename}`;

  return Response.redirect(blobUrl, 307);
}