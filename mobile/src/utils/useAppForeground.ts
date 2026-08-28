import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

// Fires `onForeground` when the app returns to the foreground from the
// background.
//
// Complements useFocusEffect: that covers tab/screen navigation, but NOT
// the app going background → foreground while the screen stayed focused. A
// list the user left open, backgrounded for hours, then came back to would
// otherwise show stale content (or a stale offline-cache fallback) until a
// manual pull-to-refresh. Realtime addendum
// (docs/specs/addendum-realtime-community.md) Phase B — the messages stream
// already re-syncs on foreground via its `resync` event; this is the same
// idea for the surfaces that aren't stream consumers (feed, notifications).
export function useAppForeground(onForeground: () => void): void {
  const callbackRef = useRef(onForeground);
  useEffect(() => {
    callbackRef.current = onForeground;
  });

  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener("change", (next: AppStateStatus) => {
      // Only the real background → active edge — not inactive → active
      // (notification shade, control centre, an incoming-call banner), which
      // would fire a redundant refetch every time one is dismissed.
      if (previous.match(/inactive|background/) && next === "active") {
        callbackRef.current();
      }
      previous = next;
    });
    return () => subscription.remove();
  }, []);
}
