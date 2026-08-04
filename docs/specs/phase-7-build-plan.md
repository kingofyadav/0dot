# Phase 7 — Knowledge: build plan (saved for later)

> Companion to the actual spec at
> [phase-7-knowledge.md](phase-7-knowledge.md); this is the implementation
> plan, not the spec itself. This session builds §1–§3 below (Articles +
> the generalized Reaction/Comment primitive, scoped to articles); §4 onward
> is saved for future sessions, same "one comprehensive plan, then
> section-by-section execution" rhythm as
> [phase-5-build-plan.md](phase-5-build-plan.md).

## This session's scope

Per the spec's own §12 suggested build sequence, steps 1–3 — the smallest
slice that exercises the whole system end-to-end: `Article` (all three
formats) with the public/unlisted/private visibility model, the generalized
`Reaction`/`Comment` primitive scoped to `subject_type = article`, and
`ArticleHashtag` tag integration. Steps 4–10 (extending `WikiPage` to
profile/book ownership, `Book`, `PublishedFile`, and combined search) are
saved for future sessions — listed at the bottom of this doc in the spec's
own order so a future session can pick up without re-deriving sequencing.

## 1. Article (spec §3)

**Schema**: `Article` (`authorId` fk → `User`, `slug` scoped per-author via
`@@unique([authorId, slug])` — same shape `WikiPage`'s
`@@unique([communityId, slug])` already established relative to `Community`,
substituting `authorId` since there's no community-equivalent owner here;
deliberately **not** `Project`'s flat globally-`@unique` slug, which doesn't
fit a `0dot.in/@username/articles/slug` URL). `format`/`status`/`visibility`
are plain strings per this schema's existing convention. `body` reuses
`renderWikiMarkdown` (`src/lib/wiki-markdown.tsx`) — the same render-time-only
sanitized-markdown posture `Project.description` already uses — rather than
introducing a new sanitizer.

**`visibility = "private"` is the first real access-control tier in this
schema** (spec §3.2) — modeled on `Community.visibility`'s existing
`visibility !== "private" || <authorized>` read-gate (repeated inline at
every community page), not on `Project.visibility`'s `unlisted`, which is
obscurity-only. The gate lives inline in
`src/app/[username]/articles/[slug]/page.tsx` (`!isOwner && (status !==
"published" || visibility === "private")` → `notFound()`), matching the
existing convention of repeating this check per-page rather than factoring
it into a shared lib (see `post-visibility.ts`'s doc comment on why that file
only centralizes checks reused across *many* surfaces — Article has exactly
two read surfaces this session).

**`src/lib/reserved-article-slugs.ts`**: thin `validateSlugFormat` wrapper,
fifth reuse of the shared slug policy — but with an empty reserved-word set,
since article slugs are per-author-scoped, not a global namespace, so there's
no cross-author collision the way `/p/`, `/c/`, `/b/`, usernames all need to
guard against.

**`src/app/actions/articles.ts`**: `createArticle`/`updateArticle` (draft/
publish workflow; `readingTimeMinutes` computed from word count whenever
status is `published`, per spec's "cached, computed at publish time";
`publishedAt` set once on the first draft→published transition, never
overwritten on re-save), `deleteArticle` (hard delete — cleans up the
non-FK'd `Reaction`/`Comment` rows for `subjectType = "article"` in the same
transaction, since those tables use a polymorphic subject pair, not a real
foreign key). Rate-limited per Phase 1 §7.2, same `checkRateLimit` shape
every other write path uses.

**`ArticleHashtag`/`Hashtag`** (spec §3.1): **the first persisted hashtag
structure in this codebase** — Post's `#tags` (`src/lib/linkify.tsx`) are
render-time-only regex styling, never written to a table, so there was no
existing extraction/write path to extend. Author-supplied structured tags
(a comma-separated form field), not parsed from inline body text.
`syncArticleHashtags` replaces-all-on-save, same shape `syncProjectSkills`
already established.

## 2. Generalized Reaction/Comment (spec §4)

**Schema**: `Reaction` (`subjectType`/`subjectId`/`userId`, `kind` fixed to
`"like"`, `@@unique([subjectType, subjectId, userId])`) and `Comment`
(`subjectType`/`subjectId`/`authorId`/`body`/`deletedAt`) — Article is the
spec-named third-plus instance of the "single subject people react to"
pattern (after `Business.Review`, `Project`'s `ProjectLike`/
`ProjectComment`), the threshold at which the spec calls for generalizing
instead of adding a fourth bespoke pair. `subjectType`/`subjectId` is a
deliberate polymorphic pair, not a real FK (no single table spans article/
wiki_page/book/published_file to point a foreign key at) — referential
cleanup on delete is therefore an app-layer responsibility (`deleteArticle`),
not `onDelete: Cascade`.

**Only `subjectType = "article"` has a producer this session** — build plan
step 2 in the spec's own sequence. `wiki_page`/`book`/`published_file` are
added in later phase-7 sessions per spec §12 steps 5/7/9, each just adding a
branch to `src/app/actions/reactions.ts`'s `SUBJECTS` set and a matching
lookup case, not a new file or schema change.

**`src/app/actions/reactions.ts`**: `toggleReaction`/`createComment`/
`deleteComment`, generalized versions of `toggleProjectLike`/
`createProjectComment`/`deleteProjectComment` (same transaction + increment/
decrement + soft-delete shapes), keyed by `subjectType`/`subjectId` form
fields instead of a dedicated `projectId` field.

**Notifications**: `notifyArticleLike`/`notifyArticleComment` added to
`notifications.ts`, reusing the existing `like`/`comment` type values with
`subjectType: "article"` — no new `Notification.type` values, continuing the
restraint every prior phase has shown for this. `subjectId` encodes the full
path (`{authorHandle}/articles/{slug}`), same "store exactly what the href
needs" precedent `notifyJobApplication` set, since (unlike `/p/{slug}`) this
route is scoped under the author's handle, not a flat namespace.

## 3. UI

- `src/app/s/[username]/ArticleForm.tsx` + `src/app/s/[username]/content/
  articles/page.tsx` — owner-only authoring (list/create/edit), mirrors
  `ProjectForm.tsx`/`portfolio/projects/page.tsx` exactly. Added to
  `SettingsSidebar.tsx`'s "Content" group (alongside Courses/Podcast/
  Newsletter/Livestreams).
- `src/app/[username]/articles/[slug]/page.tsx` +
  `ArticleCommentForm.tsx` — public permalink with the visibility gate,
  like/comment UI, mirrors `/p/[slug]/page.tsx` + `ProjectCommentForm.tsx`.
- `src/app/[username]/articles/page.tsx` — the author's public listing,
  always `status: published, visibility: public` regardless of viewer
  (unlisted is direct-link-only per spec §3.4's acceptance criterion,
  private never appears; the owner's own full list including drafts lives
  at `/s/{handle}/content/articles`).

## Bug found and fixed along the way (not phase-7-specific)

`renderWikiMarkdown` (`src/lib/wiki-markdown.tsx`) split blocks on `\n{2,}`,
but every caller renders content from a plain uncontrolled `<textarea>`
submitted as normal form data — the HTML spec requires textarea line breaks
to normalize to CRLF on submission, so a real multi-paragraph body arrives
as `"\r\n\r\n"`, which never matches `\n{2,}` (the `\n`s aren't adjacent).
Every multi-paragraph body — including pre-existing `Project.description`
and `WikiRevision.body`, not just the new `Article.body` — was silently
collapsing into one paragraph in the browser (unit-testable behavior masked
this, since it's only reachable through a real form submission). Fixed by
normalizing `\r\n` → `\n` at the top of `renderWikiMarkdown`, verified live
via the browser smoke test below.

## Verification (same rhythm as every prior phase)

- `npx prisma migrate dev`, `npx tsc --noEmit`, `npm run lint` clean.
- Manual smoke test via the dev server (Chrome, logged in as an existing
  test account): published a public article — confirmed heading/bold/list
  markdown rendering (after the CRLF fix), computed reading time, and
  hashtags rendered; liked and commented on it, confirming count increments
  and persistence. Published a `private` article — confirmed it renders for
  the owner, is excluded from the public `/​{username}/articles` listing,
  and 404s for a logged-out visitor at its direct URL.
- Not exercised live this session: draft-vs-published gating (same code
  path as the private gate, reasoned through instead of re-tested),
  cross-account like/comment notification delivery, and `deleteArticle`'s
  `Reaction`/`Comment` cleanup transaction (code-reviewed, not
  browser-tested — no second account's credentials were available in this
  session).

---

## Saved for a future session: §4 onward (not built this session)

Per spec §12's suggested build sequence, in order, each depending on what
came before:

1. **Extend `WikiPage`/`WikiRevision` with `profile_id` ownership, `kind`,
   and `parent_page_id` hierarchy** (spec §5) — verify zero regression
   against existing Phase 3 community wiki behavior before proceeding. This
   is the step that actually cashes in Phase 3's foresight in building full
   revision history.
2. **Extend `Reaction`/`Comment` to `subject_type = wiki_page`** — add a
   branch to `SUBJECTS`/the lookup switch in `reactions.ts`, no schema
   change.
3. **`Book`** + `book_id` ownership on `WikiPage` for chapters + optional
   `ebook_file_url` (spec §6) — depends on step 1's hierarchy support.
4. **Extend `Reaction`/`Comment` to `subject_type = book`.**
5. **`PublishedFile`** + `PublishedFileDownload` + visibility-dependent
   delivery (spec §7) — independent of steps 1–4, can be parallelized with
   them. Needs the gated-delivery signed-URL pattern only for
   `private`/`unlisted` files (spec §7.2) — public files are servable from a
   stable URL with no per-request check.
6. **Extend `Reaction`/`Comment` to `subject_type = published_file`.**
7. **Combined search integration** (spec §8) — depends on steps 1–6
   existing; one new "Articles & Docs" tab spanning `Article`, `Book`, and
   public `WikiPage`/`PublishedFile` rows, naturally lands last.

The spec's five open questions (§11) — `Project.visibility` private-tier
retrofit, personal multi-author wiki editing, native-chapter-vs-uploaded-
ebook expected usage split, one combined search tab vs. separate result
types, whether `note` belongs long-term in the `Article` table — remain
unresolved; see spec §11 directly.
