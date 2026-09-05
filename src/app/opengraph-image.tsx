import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Site-wide default OG/Twitter card — Next.js uses this for any route that
// doesn't colocate its own opengraph-image (every marketing/auth page,
// /explore, /trending, etc.). Pages with a real subject (profile, business,
// community) set their own openGraph.images in generateMetadata instead —
// see those files' own comments.
export const alt = "0dot — one identity, one profile, one permanent home";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Read once at module scope, not per-request — this image has no
// per-request data, so there's nothing to gain from re-reading the file on
// every call (see this file's own "Predictable values" doc reference).
const iconData = await readFile(join(process.cwd(), "public/icon-512.png"), "base64");
const iconSrc = `data:image/png;base64,${iconData}`;

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#ededed",
          fontFamily: "sans-serif",
        }}
      >
        <img src={iconSrc} alt="" width={140} height={140} style={{ borderRadius: 28 }} />
        <div style={{ marginTop: 36, fontSize: 72, fontWeight: 700, display: "flex" }}>0dot</div>
        <div style={{ marginTop: 16, fontSize: 32, color: "#a3a3a3", display: "flex" }}>
          One identity. One profile. One permanent home.
        </div>
      </div>
    ),
    { ...size }
  );
}
