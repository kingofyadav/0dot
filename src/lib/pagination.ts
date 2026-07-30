import "server-only";

export const POST_PAGE_SIZE = 20;

export type PostCursor = { createdAt: Date; id: string };

// Cursor is a single opaque "<iso>~<id>" query param. Composite
// (createdAt, id) rather than offset — per phase-1 spec §5.4, this avoids
// posts being skipped or duplicated when new posts arrive between page
// loads, which a numeric OFFSET can't guarantee.
export function parseCursor(raw: string | undefined): PostCursor | null {
  if (!raw) return null;
  const sepIndex = raw.lastIndexOf("~");
  if (sepIndex === -1) return null;
  const iso = raw.slice(0, sepIndex);
  const id = raw.slice(sepIndex + 1);
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime()) || !id) return null;
  return { createdAt, id };
}

export function encodeCursor(post: { createdAt: Date; id: string }): string {
  return `${post.createdAt.toISOString()}~${post.id}`;
}

// Where-clause fragment for "strictly before this cursor" — spread into a
// Prisma `where` alongside other filters. Empty object when there's no
// cursor (first page).
export function cursorWhere(cursor: PostCursor | null) {
  if (!cursor) return {};
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

// Trims a take:(PAGE_SIZE+1) result down to PAGE_SIZE and reports whether
// there's a next page — the standard "fetch one extra" pagination check.
export function paginate<T extends { createdAt: Date; id: string }>(
  rows: T[]
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > POST_PAGE_SIZE;
  const items = hasMore ? rows.slice(0, POST_PAGE_SIZE) : rows;
  const nextCursor = hasMore ? encodeCursor(items[items.length - 1]) : null;
  return { items, nextCursor };
}
