import Link from "next/link";

// Shared between Sidebar (desktop) and the mobile hamburger dropdown — same
// destinations, same markup, just rendered inside a different container.
export function NavLinks({ showBookmarks }: { showBookmarks: boolean }) {
  return (
    <>
      <Link href="/feed" style={{ fontWeight: 600, opacity: 0.85 }}>
        Feed
      </Link>
      {showBookmarks && (
        <Link href="/bookmarks" style={{ fontWeight: 600, opacity: 0.85 }}>
          Bookmarks
        </Link>
      )}
      {/* Native GET form — works without JS, per NAVIGATION.md's "top
          search belongs in the persistent header." */}
      <form action="/search" method="GET" role="search" className="siteHeaderSearch">
        <input
          type="search"
          name="q"
          placeholder="Search…"
          aria-label="Search"
          className="textInput"
        />
      </form>
    </>
  );
}
