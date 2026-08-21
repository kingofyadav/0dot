import EventSource from "react-native-sse";
import { API_BASE_URL } from "../config";

// Mirrors src/lib/message-events.ts's MessageEvent union on the server
// exactly — the mobile side never needs to branch on which event arrived
// (see the server route's own comment: payload content doesn't matter to
// the client), just that *something* did, and refetch. Kept as a type
// here anyway for the same "name it explicitly" reasoning that comment
// gives for still sending real data.
export type MessageStreamEvent =
  | { type: "new-message"; conversationId: string }
  | { type: "conversation-updated"; conversationId: string }
  | { type: "notification" }
  | { type: "presence"; userId: string; online: boolean };

// One raw connection to GET /api/v1/messages/stream (M10) — the
// bearer-token counterpart to the web app's cookie-session SSE route,
// same in-memory event bus underneath. Deliberately not exported as a
// hook: MessagesStreamContext owns the single app-wide connection this
// wraps; a screen that opened its own would just be a second connection
// to the same per-user event set, wasted server-side subscriber-map
// churn on every screen mount/unmount.
export function connectMessagesStream(accessToken: string, onEvent: (event: MessageStreamEvent) => void): () => void {
  const source = new EventSource(`${API_BASE_URL}/api/v1/messages/stream`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    // The server's own 20s heartbeat comment ("keeps the connection alive
    // through idle proxies/load balancers") is the other half of this:
    // a genuinely dead connection should reconnect well before that, not
    // wait for a user to notice a stale inbox.
    timeout: 45_000,
  });

  source.addEventListener("message", (event) => {
    if (!event.data) return;
    try {
      onEvent(JSON.parse(event.data) as MessageStreamEvent);
    } catch {
      // Malformed payload — ignore this one event, the connection itself
      // is still fine and the next event will still arrive.
    }
  });

  return () => source.close();
}
