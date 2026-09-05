import { headers } from "next/headers";

// Shared by every content-type page that renders its own structured data
// (job, event, marketplace listing, ... — SEO plan Phases 2+) — same
// "hand-authored script needs the CSP nonce applied explicitly" posture as
// ThemeInitScript/layout.tsx's WebSite JSON-LD, just read directly from the
// request here (via proxy.ts's x-nonce header) instead of threaded down as
// a prop, since none of these pages already have it in scope the way
// RootLayout does.
export async function JsonLd({ data }: { data: object }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
