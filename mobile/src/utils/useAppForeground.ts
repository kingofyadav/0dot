import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

// Treats only the "background" state as inactive — "inactive" (control
// centre, an incoming-call banner, a permission dialog, a share sheet) and
// "unknown" (transient at startup) both count as active. Realtime stream
// consumers (voice rooms, livestream/community chat SSE, the messages
// stream) should call stream.setActive(isAppStateActive(state)) with this
// rather than `state === "active"` directly — the stricter check tears the
// connection down and forces a full resync on every dismissed dialog, not
// just on a real app backgrounding.
//
// Accepts the raw AppState.currentState type (string | null | undefined as
// of RN 0.88's generated types, not just AppStateStatus) — null/undefined
// only occurs before the initial state is set, which counts as active.
export function isAppStateActive(state: string | null | undefined): boolean {
  return state !== "background";
}

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
      if (previous?.match(/inactive|background/) && next === "active") {
        callbackRef.current();
      }
      previous = next;
    });
    return () => subscription.remove();
  }, []);
}
