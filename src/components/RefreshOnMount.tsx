"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// router.refresh() re-fetches the current route's full Server Component
// tree, RootLayout included — the one way to pick up a layout-level change
// (like NotificationBell/MobileBottomNav's unread badge) after a mutation
// that can't call revalidatePath itself, e.g. /notifications' read-on-view
// write during render (revalidatePath is Server-Function/Route-Handler
// only, not callable mid-render). Runs once per mount, so the caller
// should only render this when it knows the mutation actually happened.
export function RefreshOnMount() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
