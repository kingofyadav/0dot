import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCurrentUser } from "@/lib/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { POST_MEDIA_IMAGE_TYPES, POST_MEDIA_MAX_BYTES } from "@/lib/uploads";

// Client-direct upload token issuer for post images (src/app/feed/ComposeBox.tsx).
// The browser POSTs here to get a short-lived, path-scoped Blob write token,
// then PUTs the file straight to Vercel Blob — the bytes never transit a
// Server Action, which would otherwise need a ~34MB bodySizeLimit for four
// 8MB images and buffer all of them in a Function per request.
//
// createPost (src/app/actions/posts.ts) receives only the resulting URLs
// and re-verifies each one (own-store host + uploads/ prefix + first-4KB
// magic-byte sniff via verifyRemoteImageBytes) before persisting — the
// token's allowedContentTypes only checks the *declared* type, so that
// second check is what actually enforces "is an image".

// Client sends `uploads/<uuid>.<ext>`; anything else is rejected so a token
// can never be minted for another prefix (e.g. protected/).
const ALLOWED_PATHNAME = /^uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp|gif)$/i;

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        const user = await getCurrentUser();
        if (!user) throw new Error("You must be signed in to upload.");
        if (!user.emailVerifiedAt) throw new Error("Verify your email address to upload images.");
        if (!ALLOWED_PATHNAME.test(pathname)) throw new Error("Invalid upload path.");
        if (
          !(await enforceRateLimit(`post-media-upload:user:${user.id}`, {
            max: 40,
            windowMs: 15 * 60 * 1000,
          }))
        ) {
          throw new Error("You're uploading too fast. Please slow down.");
        }
        return {
          allowedContentTypes: POST_MEDIA_IMAGE_TYPES,
          maximumSizeInBytes: POST_MEDIA_MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user.id }),
        };
      },
      onUploadCompleted: async () => {
        // Intentionally empty. This callback requires a publicly reachable
        // URL and does not fire on localhost, so FileAsset creation and the
        // magic-byte check are done in createPost instead — that runs in
        // every environment.
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed." },
      { status: 400 },
    );
  }
}
