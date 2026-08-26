"use client";

import { useEffect, useRef, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Search, LoaderCircle } from "lucide-react";

const DEBOUNCE_MS = 300;

// Still a real GET form (Enter submits, works with JS disabled — same
// posture as the shared SearchForm in the header) — the onChange handler
// just progressively enhances it with debounced live search via
// router.replace, a soft nav that re-renders this Server Component page
// with the new searchParams instead of a full reload.
export function SearchBox({ defaultValue, tab }: { defaultValue: string; tab: string }) {
  const router = useRouter();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Kept current on every render so the debounced callback below reads the
  // CURRENT tab at fire time, not the one closed over when the keystroke
  // scheduled it. Without this: typing schedules a replace() for tab="users",
  // then clicking a different tab's <Link> within the 300ms window navigates
  // immediately (SearchBox doesn't unmount for a tab change — same route,
  // only searchParams differ — so the stale timeout survives) — the timeout
  // then fires moments later and silently reverts the URL back to the old
  // tab, making the click look like it did nothing.
  const tabRef = useRef(tab);
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  // Previously the 300ms debounce window plus the actual navigation was a
  // silent gap — nothing on screen indicated a search was even happening
  // (UX_GUIDELINES.md #11). isDebouncing covers "waiting for the user to
  // stop typing"; isPending (from wrapping router.replace in a transition,
  // which React flips true synchronously when the transition starts) picks
  // up right where isDebouncing leaves off, covering "waiting for the
  // re-rendered results" — together they span the whole keystroke-to-results
  // window with no gap.
  const [isDebouncing, setIsDebouncing] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setIsDebouncing(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsDebouncing(false);
      startTransition(() => {
        router.replace(`/search?q=${encodeURIComponent(value)}&tab=${tabRef.current}`);
      });
    }, DEBOUNCE_MS);
  }

  const isSearching = isDebouncing || isPending;

  return (
    <form action="/search" method="GET" style={{ marginBottom: "1.25rem" }}>
      <div className="searchFieldWrap">
        {isSearching ? (
          <LoaderCircle className="searchFieldIcon searchFieldSpinner" size={16} aria-hidden="true" />
        ) : (
          <Search className="searchFieldIcon" size={16} aria-hidden="true" />
        )}
        <input
          type="search"
          name="q"
          defaultValue={defaultValue}
          onChange={handleChange}
          placeholder="Search users or posts…"
          className="textInput"
          autoFocus
        />
      </div>
      <input type="hidden" name="tab" value={tab} />
    </form>
  );
}
