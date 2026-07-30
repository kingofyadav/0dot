"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

// A <details>/<summary> dropdown — same progressive-disclosure pattern as
// .profileEditToggle elsewhere in this codebase, so it degrades to a working
// (if inelegant) disclosure without JS. The one thing that genuinely needs
// client JS: SiteHeader lives in the root layout and isn't remounted by
// App Router client-side navigation, so without this the menu would stay
// open after tapping a link inside it.
export function MobileNavMenu({ children }: { children: ReactNode }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
  }, [pathname]);

  return (
    <details ref={detailsRef} className="mobileNavMenu">
      <summary className="mobileNavToggle" aria-label="Open menu">
        <span aria-hidden="true">☰</span>
      </summary>
      <div className="mobileNavPanel">{children}</div>
    </details>
  );
}
