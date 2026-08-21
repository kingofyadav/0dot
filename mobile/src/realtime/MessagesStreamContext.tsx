import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { connectMessagesStream, type MessageStreamEvent } from "./messagesStream";

type Listener = (event: MessageStreamEvent) => void;

const MessagesStreamContext = createContext<{ subscribe: (listener: Listener) => () => void } | null>(null);

// M10: one connection for the whole signed-in session, not one per screen
// — mirrors the web app's own MessagingProvider (one SSE tab connection,
// many consumers) rather than app/messages/[id].tsx and (tabs)/messages.tsx
// each opening (and re-opening on every focus) their own subscription to
// the same per-user event set. Mounted once in app/_layout.tsx, inside
// AuthProvider so useAuth() is available.
export function MessagesStreamProvider({ children }: { children: ReactNode }) {
  const { status, tokens } = useAuth();
  const listeners = useRef<Set<Listener>>(new Set());

  useEffect(() => {
    if (status !== "signedIn" || !tokens?.accessToken) return;
    // Recreated whenever the access token rotates (pkceAuth's refresh
    // flow) — EventSource has no way to swap its own Authorization header
    // mid-connection, so a stale token would otherwise keep being used
    // until the connection happened to drop on its own.
    return connectMessagesStream(tokens.accessToken, (event) => {
      for (const listener of listeners.current) listener(event);
    });
  }, [status, tokens?.accessToken]);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);

  return <MessagesStreamContext.Provider value={{ subscribe }}>{children}</MessagesStreamContext.Provider>;
}

// `onEvent` is read from a ref, not put in the subscribe effect's own
// dependency array — every call site below passes an inline arrow closing
// over screen state (id, load, …), which would otherwise resubscribe on
// every render instead of once per mount. The ref itself is kept current
// via its own effect (not a direct mutation in the render body) so this
// stays safe under React Compiler's assumptions about render purity.
export function useMessagesStreamEvents(onEvent: Listener) {
  const ctx = useContext(MessagesStreamContext);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    if (!ctx) return;
    return ctx.subscribe((event) => onEventRef.current(event));
  }, [ctx]);
}
