# Performance

Status: Foundational document (Priority 9). Targets to design and build against, plus an honest read of where the current implementation already diverges from them.

## Targets

- **First Contentful Paint < 2s** on a representative connection (target mid-tier mobile, not just fast broadband/dev machine).
- **Smooth 60 FPS scrolling**, especially on the feed once it has real volume.
- **Lazy-loaded images** — Media and avatar uploads now exist (`ENGINEERING_ARCHITECTURE.md`), so this is a live, unmet target, not a future one: see Current State below.
- **Optimized media** — responsive image sizing/formats. Still genuinely absent: uploads are stored and served at original size, no resize/format pipeline on top of Vercel Blob (`ENGINEERING_ARCHITECTURE.md` Media Processing).
- **Infinite scrolling / pagination** on any list that can grow unbounded.
- **Offline support where feasible** — not a Phase 1 concern; revisit once a service worker / PWA story exists (Phase 15).

## Current State vs. Targets

- **`/feed` and profile Posts both fetch with `take: 50` and no cursor/offset pagination.** This works fine at today's data volume but is a real, known gap against the "infinite scrolling" target — the 51st post is simply invisible with no way to reach it. This should be fixed (cursor-based pagination + a "load more"/infinite-scroll trigger) before real users generate more than 50 posts total, not after.
- **No lazy-loading, no explicit width/height, on real user-uploaded images.** Media shipped (`Post.media`, avatars, business/community assets — see `ENGINEERING_ARCHITECTURE.md`), but `PostMediaGrid` (`src/components/PostCard.tsx`) renders a plain `<img>` with none of that — this is now an active violation of Rule 2 below, not a deferred future concern.
- **No caching layer beyond Next.js's own `revalidatePath` invalidation.** Fine at current scale, low traffic; will need a real strategy (see `ENGINEERING_ARCHITECTURE.md`) before it isn't.
- **Client-side performance monitoring exists — server-side doesn't.** `@vercel/analytics` + `@vercel/speed-insights` (mounted in `layout.tsx`) give real Core Web Vitals collection now, closing the "60 FPS"/"<2s FCP" measurability gap this bullet used to flag. Still missing: server-side latency/APM tracking for Server Actions and Route Handlers.

## Rules

1. **Any new list view (feed, followers, search results, comments) ships with pagination from day one**, not "add pagination later once it's slow" — the current `/feed` unpaginated `take: 50` is an accepted, explicitly-flagged exception for the MVP, not a pattern to repeat going forward.
2. **No image ships without an explicit width/height and a lazy-loading strategy** — prevents layout shift, which is both a performance and UX concern. `PostMediaGrid`'s plain `<img>` (see Current State above) is the existing violation to fix, not a template to copy for the next media surface.
3. **Server Components stay the default** for anything that doesn't need interactivity (the current codebase already does this correctly — `PostCard`, profile page, feed page are all Server Components with `ComposeBox`/forms as the only client boundaries). Don't convert something to a Client Component just for convenience; each one is a bundle-size and hydration cost.
4. **Measure before optimizing.** Once basic monitoring exists, performance work is prioritized by what the numbers show, not by intuition about what "feels slow."
