import EventSource from "react-native-sse";
import { API_BASE_URL } from "../config";

// The shared bearer-token SSE client behind every realtime surface the app
// consumes — the per-user messages stream and (Phase C) per-community chat.
// Owns: AppState gating, exponential backoff reconnection, and a synthetic
// `resync` event on every reconnect-after-the-first so consumers can close
// the gap of anything published while the socket was down or the app was
// backgrounded (spec addendum-realtime-community.md Phase B).

export interface EventStream {
  /** Foreground/background gate. false → close the socket and stop
   *  reconnecting; true → (re)connect and, once open, emit `resync`. */
  setActive(active: boolean): void;
  /** Permanent teardown (sign-out / token rotation / screen unmount). */
  close(): void;
}

// react-native-sse auto-reconnects on a fixed interval and adopts the
// server's `retry:` hint (2000ms). We take that over so backgrounding
// actually stops the radio traffic, and so a flaky network backs off
// instead of hammering a reconnect every 2s.
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

export function createEventStream<E extends { type: string }>(opts: {
  /** Absolute path under API_BASE_URL, e.g. "/api/v1/messages/stream". */
  path: string;
  accessToken: string;
  onEvent: (event: E) => void;
}): EventStream {
  let source: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;
  let active = false;
  let closed = false;
  // Stays true once we've had one open connection this session — gates the
  // `resync` emit so the *first* connect doesn't fire it (the caller does
  // its own initial fetch on mount).
  let hadConnection = false;
  // The last SSE `id:` we saw. When the server sends `id:` frames (community
  // chat does; the messages stream doesn't), we send it back as
  // `Last-Event-ID` on reconnect and let the server replay the gap — so we
  // skip the client-side `resync` in that case. Null → server has nothing
  // to replay from → fall back to a full `resync` on every reconnect.
  let lastEventId: string | null = null;

  function teardownSource() {
    if (!source) return;
    // react-native-sse tracks the id internally too — grab whatever it last
    // parsed (covers id-only frames that never fire a `message` event).
    const tracked = (source as unknown as { lastEventId: string | null }).lastEventId;
    if (tracked != null && tracked !== "") lastEventId = tracked;
    source.removeAllEventListeners();
    source.close();
    source = null;
  }

  function scheduleReconnect() {
    if (closed || !active || reconnectTimer) return;
    const backoff = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempts);
    const jittered = backoff * (0.5 + Math.random() / 2); // 50–100% of backoff
    attempts += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, jittered);
  }

  function connect() {
    if (closed || !active || source) return;

    const es = new EventSource(`${API_BASE_URL}${opts.path}`, {
      headers: { Authorization: `Bearer ${opts.accessToken}` },
      timeout: 45_000,
      // We drive reconnection ourselves (see below) — set this high so the
      // library's own poll never races our backoff.
      pollingInterval: MAX_DELAY_MS * 4,
    });
    // Hard-disable react-native-sse's internal reconnect: it otherwise
    // re-opens on every error/DONE and adopts the server's `retry:` hint,
    // which would fight setActive(false) and the backoff above.
    (es as unknown as { _pollAgain: () => void })._pollAgain = () => {};
    // Seed the id so react-native-sse sends `Last-Event-ID` on this fresh
    // connection (it does this automatically, but only from its own tracked
    // value, which a brand-new instance has reset to null).
    if (lastEventId != null) {
      (es as unknown as { lastEventId: string | null }).lastEventId = lastEventId;
    }

    es.addEventListener("open", () => {
      attempts = 0;
      // `resync` is client-only, never sent by the server (the server can
      // send one too, in the replay-gap case — see the chat stream route).
      // Emit it on reconnect ONLY when we have no id to replay from; when we
      // do, the server replays the gap (or sends its own resync). Cast: it's
      // a valid member of every consumer's union (all include resync).
      if (hadConnection && lastEventId == null) opts.onEvent({ type: "resync" } as E);
      hadConnection = true;
    });

    es.addEventListener("message", (event) => {
      if (event.lastEventId != null && event.lastEventId !== "") lastEventId = event.lastEventId;
      if (!event.data) return;
      try {
        opts.onEvent(JSON.parse(event.data) as E);
      } catch {
        // Malformed single frame — ignore it, the connection is still fine.
      }
    });

    const onDrop = () => {
      teardownSource();
      scheduleReconnect();
    };
    es.addEventListener("error", onDrop);
    es.addEventListener("close", onDrop);

    source = es;
  }

  return {
    setActive(next: boolean) {
      if (next === active || closed) return;
      active = next;
      if (active) {
        connect();
      } else {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = null;
        attempts = 0;
        teardownSource();
      }
    },
    close() {
      closed = true;
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      teardownSource();
    },
  };
}
