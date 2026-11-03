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
  // JSON.stringify does not escape "<" — a field containing the literal text
  // "</script>" (e.g. a user-authored job title or review) would otherwise
  // close this script element early and let arbitrary markup/script that
  // follows it in the JSON execute. <-escaping keeps the payload valid
  // JSON (consumers JSON.parse it back to the same value) while making it
  // impossible to break out of the <script> tag.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: json }} />;
}
