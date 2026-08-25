"use client";

import { useRef, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

const DEBOUNCE_MS = 300;

// Still a real GET form (Enter submits, works with JS disabled — same
// posture as the shared SearchForm in the header) — the onChange handler
// just progressively enhances it with debounced live search via
// router.replace, a soft nav that re-renders this Server Component page
// with the new searchParams instead of a full reload.
export function SearchBox({ defaultValue, tab }: { defaultValue: string; tab: string }) {
  const router = useRouter();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      router.replace(`/search?q=${encodeURIComponent(value)}&tab=${tab}`);
    }, DEBOUNCE_MS);
  }

  return (
    <form action="/search" method="GET" style={{ marginBottom: "1.25rem" }}>
      <div className="searchFieldWrap">
        <Search className="searchFieldIcon" size={16} aria-hidden="true" />
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
