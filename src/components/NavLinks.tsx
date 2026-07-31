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
      <Link href="/explore" style={{ fontWeight: 600, opacity: 0.85 }}>
        Explore
      </Link>
      <Link href="/trending" style={{ fontWeight: 600, opacity: 0.85 }}>
        Trending
      </Link>
      <Link href="/c" style={{ fontWeight: 600, opacity: 0.85 }}>
        Communities
      </Link>
      <Link href="/b" style={{ fontWeight: 600, opacity: 0.85 }}>
        Businesses
      </Link>
      {showBookmarks && (
        <Link href="/messages" style={{ fontWeight: 600, opacity: 0.85 }}>
          Messages
        </Link>
      )}
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
