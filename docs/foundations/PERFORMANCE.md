# Performance

Status: Foundational document (Priority 9). Targets to design and build against, plus an honest read of where the current implementation already diverges from them.

## Targets

- **First Contentful Paint < 2s** on a representative connection (target mid-tier mobile, not just fast broadband/dev machine).
- **Smooth 60 FPS scrolling**, especially on the feed once it has real volume.
- **Lazy-loaded images** — `PostMediaGrid` now sets `loading="lazy"` + `decoding="async"`; the remaining gap is explicit `width`/`height` (layout shift). See Current State below.
- **Optimized media** — responsive image sizing/formats. Still genuinely absent: uploads are stored and served at original size, no resize/format pipeline on top of Vercel Blob (`ENGINEERING_ARCHITECTURE.md` Media Processing).
- **Infinite scrolling / pagination** on any list that can grow unbounded — `/feed` and profile Posts now do cursor pagination via `src/lib/pagination.ts` (`POST_PAGE_SIZE + 1`, "Load more" link in `FeedList.tsx`). Other lists (search, followers, messages) not yet swept.
- **Offline support where feasible** — not a Phase 1 concern; revisit once a service worker / PWA story exists (Phase 15).

## Current State vs. Targets

- **`/feed` and profile Posts now paginate.** Cursor-based (`src/lib/pagination.ts` — `cursorWhere`/`paginate`/`POST_PAGE_SIZE`), with a "Load more" link in `FeedList.tsx` that appends `?cursor=`. The "51st post is unreachable" gap earlier revisions flagged is closed. Still a plain link, not an IntersectionObserver-driven infinite scroll — fine for now.
- **Lazy-loading now on user-uploaded post images; explicit width/height still missing.** `PostMediaGrid` (`src/components/PostCard.tsx`) sets `loading="lazy"`, `decoding="async"`, and meaningful `alt` text. It still renders without explicit `width`/`height`, so it's a **partial** violation of Rule 2 — the layout-shift half is unfixed (no dimensions stored in `MediaItem`, which is just `{id, url}`).
- **No caching layer beyond Next.js's own `revalidatePath` invalidation.** Fine at current scale, low traffic; will need a real strategy (see `ENGINEERING_ARCHITECTURE.md`) before it isn't.
- **Client-side performance monitoring exists — server-side doesn't.** `@vercel/analytics` + `@vercel/speed-insights` (mounted in `layout.tsx`) give real Core Web Vitals collection now, closing the "60 FPS"/"<2s FCP" measurability gap this bullet used to flag. A post-deploy `scripts/smoke-test.mjs` (CI) checks the live site is serving the just-pushed code. Still missing: server-side latency/APM tracking for Server Actions and Route Handlers, and web-app error tracking (mobile has Sentry, web doesn't — see `ENGINEERING_ARCHITECTURE.md`).

## Rules

1. **Any new list view (feed, followers, search results, comments) ships with pagination from day one**, not "add pagination later once it's slow". `/feed` and profile Posts now comply (`src/lib/pagination.ts`); followers, search results, and messages history are the lists still to sweep onto the same helper.
2. **No image ships without an explicit width/height and a lazy-loading strategy** — prevents layout shift, which is both a performance and UX concern. `PostMediaGrid` now has the lazy-loading half; the width/height half is still open (blocked on storing image dimensions at upload time) — fix that, don't copy the current state to the next media surface.
3. **Server Components stay the default** for anything that doesn't need interactivity (the current codebase already does this correctly — `PostCard`, profile page, feed page are all Server Components with `ComposeBox`/forms as the only client boundaries). Don't convert something to a Client Component just for convenience; each one is a bundle-size and hydration cost.
4. **Measure before optimizing.** Once basic monitoring exists, performance work is prioritized by what the numbers show, not by intuition about what "feels slow."
