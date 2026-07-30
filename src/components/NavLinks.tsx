import Link from "next/link";
import { SearchForm } from "./SearchForm";

// Shared between Sidebar (desktop) and the mobile hamburger dropdown — same
// destinations, same markup, just rendered inside a different container.
export function NavLinks({
  showBookmarks,
  profileHandle,
}: {
  showBookmarks: boolean;
  profileHandle: string | null;
}) {
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
      {profileHandle && (
        <Link href={`/${profileHandle}`} style={{ fontWeight: 600, opacity: 0.85 }}>
          Profile
        </Link>
      )}
      <SearchForm />
    </>
  );
}
