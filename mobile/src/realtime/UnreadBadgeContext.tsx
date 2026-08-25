import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { useMessagesStreamEvents } from "./MessagesStreamContext";
import { getUnreadCounts } from "../api/client";
import type { UnreadCounts } from "../api/types";

type UnreadBadgeValue = UnreadCounts & { refetch: () => void };

const UnreadBadgeContext = createContext<UnreadBadgeValue>({ messages: 0, notifications: 0, refetch: () => {} });

// Mobile pro-upgrade addendum, sub-phase M13 — feeds the (tabs)/_layout.tsx
// tab-bar badges. Mounted once inside MessagesStreamProvider (needs
// useMessagesStreamEvents) so both the Messages and Notifications icons
// share one fetch rather than each tab polling GET /api/v1/unread-counts
// independently. Refetches on sign-in, on app foreground, and on every
// stream event — message-events.ts's bus already carries a bare
// `{type: "notification"}` event alongside "new-message"/
// "conversation-updated" (notifications.ts's own notify* helpers publish
// to the same per-user bus GET /api/v1/messages/stream subscribes to), so
// this stays live for both counts even though only one of them has its
// own dedicated screen-level polling loop.
export function UnreadBadgeProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [counts, setCounts] = useState<UnreadCounts>({ messages: 0, notifications: 0 });
  const inFlight = useRef(false);

  const refetch = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    getUnreadCounts()
      .then(setCounts)
      .catch(() => {
        // Best-effort — a failed badge refresh just means the count is
        // stale until the next trigger, not worth surfacing to the user.
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, []);

  // No explicit "reset to zero" branch on sign-out: the tab bar these
  // counts feed isn't rendered outside a signed-in session (RootNavigator
  // shows SignInScreen/LockScreen instead), so a stale count sitting
  // unused in this provider's state is harmless, and the next sign-in
  // refetches fresh values anyway. Keeping this effect to "call refetch,
  // which setStates from its own .then callback" (not synchronously in
  // the effect body) is what react-hooks/set-state-in-effect actually
  // wants — see that rule's own message for the distinction.
  useEffect(() => {
    if (status === "signedIn") refetch();
  }, [status, refetch]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active" && status === "signedIn") refetch();
    });
    return () => subscription.remove();
  }, [status, refetch]);

  useMessagesStreamEvents((event) => {
    if (event.type === "new-message" || event.type === "conversation-updated" || event.type === "notification") refetch();
  });

  return <UnreadBadgeContext.Provider value={{ ...counts, refetch }}>{children}</UnreadBadgeContext.Provider>;
}

export function useUnreadBadges(): UnreadBadgeValue {
  return useContext(UnreadBadgeContext);
}
