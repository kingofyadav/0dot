"use client";

import { useState } from "react";
import { Play } from "lucide-react";

// Click-to-load YouTube embed. Until the visitor presses play this is just a
// thumbnail <img> — no YouTube iframe, scripts, or cookies on "/"'s first
// load (a real embed costs ~1MB of third-party JS per video). After the
// click it swaps in the privacy-enhanced youtube-nocookie.com player with
// autoplay, so it still feels like one click to watch. Both hosts are
// allowlisted in the CSP (src/lib/proxy-routing.ts: img-src i.ytimg.com,
// frame-src www.youtube-nocookie.com).
export function LiteYouTube({ id, title, priority = false }: { id: string; title: string; priority?: boolean }) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="fpVideo">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    );
  }

  const maxresUrl = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
  const hqUrl = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  // The priority (lead) instance is "/"'s LCP element — a live maxresdefault
  // fetch runs ~170KB+ from a third-party CDN, slow enough under throttling
  // to cost real Lighthouse points. scripts/generate-video-poster.mjs
  // pre-shrinks it into two local WebP widths; this is the only poster that
  // uses them. 700w covers the single-column mobile slot (~662 physical px
  // at DPR 1.75), 960w the two-column desktop slot (~784 CSS px) — without
  // both, mobile either downloads 960w's extra ~22KB for nothing or 700w
  // ships blurry on desktop. If a video's pinned as the lead before its
  // posters have been generated, onError below falls through to the live
  // fetch chain exactly as before.
  const localPosterBase = priority ? `/video-posters/${id}` : null;

  return (
    <button type="button" className="fpVideo fpVideoPoster" onClick={() => setPlaying(true)} aria-label={`Play video: ${title}`}>
      {/* Plain <img>, not next/image: the optimizer would proxy YouTube's
          CDN through this app for no gain — i.ytimg.com already serves a
          correctly sized JPEG. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={localPosterBase ? `${localPosterBase}-960.webp` : maxresUrl}
        srcSet={localPosterBase ? `${localPosterBase}-700.webp 700w, ${localPosterBase}-960.webp 960w` : undefined}
        sizes={localPosterBase ? "(max-width: 760px) calc(100vw - 32px), 784px" : undefined}
        // maxresdefault (1280x720, true 16:9) only exists for videos
        // uploaded in HD; YouTube serves a 120x90 grey placeholder, or a
        // 404, otherwise. Fall back to hqdefault, which always exists.
        onLoad={(e) => {
          if (e.currentTarget.currentSrc.endsWith(".webp")) return; // local poster loaded fine
          if (e.currentTarget.naturalWidth <= 120) e.currentTarget.src = hqUrl;
        }}
        onError={(e) => {
          if (localPosterBase && e.currentTarget.currentSrc.endsWith(".webp")) {
            e.currentTarget.removeAttribute("srcset");
            e.currentTarget.src = maxresUrl;
            return;
          }
          if (!e.currentTarget.src.endsWith("/hqdefault.jpg")) e.currentTarget.src = hqUrl;
        }}
        alt=""
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
      />
      <span className="fpVideoPlay" aria-hidden="true">
        <Play size={26} fill="currentColor" />
      </span>
    </button>
  );
}
