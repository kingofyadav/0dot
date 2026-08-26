"use client";

import { useEffect } from "react";

// A "X liked/replied to your post" notification links to
// `/${handle}#post-${id}` (src/lib/notifications.ts) — the browser's native
// hash-anchor scroll only fires on the initial navigation's paint, which
// for an RSC page frequently loses the race against streamed-in content,
// and does nothing at all for a same-page client transition. This mounts
// once per page (see [username]/page.tsx) and does the scroll itself once
// the post list has actually painted, plus a brief highlight so the
// destination is unmistakable rather than just "the page didn't move."
//
// Known limitation, not solved here: the profile posts list is paginated
// (`take` + a "Load more" link) — if the target post isn't on the first
// page, its #post-<id> element doesn't exist yet and this is a no-op. See
// docs/plans/scalable-launching-quilt.md Phase 0 item 6.
export function ScrollToHashPost() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#post-")) return;

    const target = document.querySelector<HTMLElement>(hash);
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("postHighlight");
    const timeout = setTimeout(() => target.classList.remove("postHighlight"), 2000);
    return () => clearTimeout(timeout);
  }, []);

  return null;
}
