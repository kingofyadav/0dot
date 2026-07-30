# Performance

Status: Foundational document (Priority 9). Targets to design and build against, plus an honest read of where the current implementation already diverges from them.

## Targets

- **First Contentful Paint < 2s** on a representative connection (target mid-tier mobile, not just fast broadband/dev machine).
- **Smooth 60 FPS scrolling**, especially on the feed once it has real volume.
- **Lazy-loaded images** — relevant once Media (Phase 1's "image/video posts", not yet built) and avatar uploads exist; nothing to lazy-load yet since the only images today are the static logo mark.
- **Optimized media** — responsive image sizing/formats once uploads exist (see `ENGINEERING_ARCHITECTURE.md` media-processing gap).
- **Infinite scrolling / pagination** on any list that can grow unbounded.
- **Offline support where feasible** — not a Phase 1 concern; revisit once a service worker / PWA story exists (Phase 15).

## Current State vs. Targets

- **`/feed` and profile Posts both fetch with `take: 50` and no cursor/offset pagination.** This works fine at today's data volume but is a real, known gap against the "infinite scrolling" target — the 51st post is simply invisible with no way to reach it. This should be fixed (cursor-based pagination + a "load more"/infinite-scroll trigger) before real users generate more than 50 posts total, not after.
- **No lazy-loading anywhere** — not yet a problem, since there are no images in user content yet. Becomes a real requirement the moment Media ships.
- **No caching layer beyond Next.js's own `revalidatePath` invalidation.** Fine at current scale (SQLite, low traffic); will need a real strategy (see `ENGINEERING_ARCHITECTURE.md`) before Phase 2+ traffic.
- **No performance monitoring at all.** No Core Web Vitals collection, no server-side latency tracking. This is a gap worth closing early — "60 FPS" and "<2s FCP" are unverifiable claims without measurement, and it's much cheaper to add basic monitoring now (Phase 1 scale) than to retrofit it once diagnosing a real production slowdown matters.

## Rules

1. **Any new list view (feed, followers, search results, comments) ships with pagination from day one**, not "add pagination later once it's slow" — the current `/feed` unpaginated `take: 50` is an accepted, explicitly-flagged exception for the MVP, not a pattern to repeat going forward.
2. **No image ships without an explicit width/height and a lazy-loading strategy** once media upload exists — prevents layout shift, which is both a performance and UX concern.
3. **Server Components stay the default** for anything that doesn't need interactivity (the current codebase already does this correctly — `PostCard`, profile page, feed page are all Server Components with `ComposeBox`/forms as the only client boundaries). Don't convert something to a Client Component just for convenience; each one is a bundle-size and hydration cost.
4. **Measure before optimizing.** Once basic monitoring exists, performance work is prioritized by what the numbers show, not by intuition about what "feels slow."
