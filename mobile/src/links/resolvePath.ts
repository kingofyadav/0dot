import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { API_BASE_URL } from "../config";

// One resolver for three call sites: a universal link's incoming path
// (universalLinks.ts), a notification's href field (already computed
// server-side by getNotificationHref — src/lib/notifications.ts), and a
// future push notification tap (pushNavigation.ts) — all three hand this
// the exact same relative-path shape the web app itself uses
// ("/p/{id}", "/{username}", ...), so there's only one place that knows
// how a path maps to a native screen.
export function resolvePath(path: string): void {
  const postMatch = path.match(/^\/p\/([^/?#]+)/);
  if (postMatch) {
    router.push({ pathname: "/post/[id]", params: { id: postMatch[1] } });
    return;
  }

  // Every other known top-level namespace this app doesn't have a native
  // screen for yet (/c/, /b/, /e/, /messages/, ...) falls through below —
  // checked before the bare-username catch-all so e.g. "/feed" or
  // "/notifications" don't get misread as a username.
  const reservedFirstSegment = /^\/(c|b|e|messages|feed|notifications|login|signup|s)(\/|$)/;
  const usernameMatch = !reservedFirstSegment.test(path) && path.match(/^\/([^/?#]+)\/?$/);
  if (usernameMatch) {
    router.push({ pathname: "/[username]", params: { username: usernameMatch[1] } });
    return;
  }

  // Honest fallback: no native screen covers this path yet, so open it in
  // the system browser rather than pretending full in-app coverage.
  WebBrowser.openBrowserAsync(`${API_BASE_URL}${path}`).catch(() => {});
}
