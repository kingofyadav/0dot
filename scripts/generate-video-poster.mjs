#!/usr/bin/env node
// Pre-optimized poster for the landing page's lead video (src/components/
// frontpage/LiteYouTube.tsx) — that poster is "/"'s LCP element, and YouTube's
// own maxresdefault.jpg (1280x720, true 16:9) runs ~170KB+, which is slow
// enough over a throttled connection to cost real Lighthouse performance
// points. This fetches it once and re-encodes it into two local WebP widths
// under public/video-posters/: <id>-700.webp (mobile/narrow viewports) and
// <id>-960.webp (the two-column desktop layout). LiteYouTube.tsx wires both
// into a srcset so each viewport downloads only the bytes it needs — Chrome
// DevTools' mobile emulation (412 CSS px wide, DPR 1.75) was still being
// served the 960w asset before this, ~22KB heavier than its ~662 physical-px
// slot needed. LiteYouTube.tsx only uses these local files for the
// `priority` (lead) instance; it falls back to the live YouTube fetch chain
// if no local files exist yet for a video id.
//
// Run this whenever the pinned lead video (landing-content.ts's VIDEOS[0])
// changes, so the new lead gets its own fast local posters:
//   node scripts/generate-video-poster.mjs <youtubeVideoId>

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const POSTER_WIDTHS = [700, 960]; // mobile slot (~662 physical px) and the desktop two-column slot (~784 CSS px)
const POSTER_QUALITY = 75;

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error("Usage: node scripts/generate-video-poster.mjs <youtubeVideoId>");
  const sourceUrl = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;

  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`Fetching ${sourceUrl} failed: ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());

  const meta = await sharp(bytes).metadata();
  if ((meta.width ?? 0) <= 120) {
    throw new Error(`${id} has no maxresdefault thumbnail (YouTube served its ${meta.width}x${meta.height} placeholder) — nothing to generate.`);
  }

  const outDir = path.resolve(import.meta.dirname, "../public/video-posters");
  await mkdir(outDir, { recursive: true });

  for (const width of POSTER_WIDTHS) {
    const outPath = path.join(outDir, `${id}-${width}.webp`);
    const webp = await sharp(bytes).resize({ width }).webp({ quality: POSTER_QUALITY }).toBuffer();
    await writeFile(outPath, webp);
    console.log(`Wrote ${outPath} (${(webp.length / 1024).toFixed(1)}KB, from ${(bytes.length / 1024).toFixed(1)}KB source)`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
