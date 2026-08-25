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

  // Mobile pro-upgrade addendum M3: resolves the message-notification href
  // deferral phase-15 spec §4 named — no title/avatar available from a bare
  // path (unlike the in-app tap from ConversationRow, which passes those as
  // route params), so the thread screen falls back to a generic header
  // until its own fetch resolves.
  const messageMatch = path.match(/^\/messages\/([^/?#]+)/);
  if (messageMatch && messageMatch[1] !== "new" && messageMatch[1] !== "requests") {
    router.push({ pathname: "/messages/[id]", params: { id: messageMatch[1] } });
    return;
  }

  // Mobile pro-upgrade addendum M4-M6: communities/businesses/events all
  // gained a native detail screen — each keyed by slug, matching /c/{slug},
  // /b/{slug}, /e/{slug} exactly. "/new" (create-flow, web-only for now)
  // and bare "/c"/"/b"/"/e" (the index pages — the native Discover hub
  // covers that instead) fall through to the browser like everything else
  // not yet natively covered.
  const communityMatch = path.match(/^\/c\/([^/?#]+)/);
  if (communityMatch && communityMatch[1] !== "new") {
    router.push({ pathname: "/community/[slug]", params: { slug: communityMatch[1] } });
    return;
  }
  const businessMatch = path.match(/^\/b\/([^/?#]+)/);
  if (businessMatch && businessMatch[1] !== "new") {
    router.push({ pathname: "/business/[slug]", params: { slug: businessMatch[1] } });
    return;
  }
  const eventMatch = path.match(/^\/e\/([^/?#]+)/);
  if (eventMatch && eventMatch[1] !== "new") {
    router.push({ pathname: "/event/[slug]", params: { slug: eventMatch[1] } });
    return;
  }

  // Mobile pro-upgrade addendum M13: followers/following lists. Two
  // segments, so these must be checked before the single-segment
  // usernameMatch catch-all below (which only matches "/{username}",
  // not "/{username}/followers").
  const followersMatch = path.match(/^\/([^/?#]+)\/followers\/?$/);
  if (followersMatch) {
    router.push({ pathname: "/[username]/followers", params: { username: followersMatch[1] } });
    return;
  }
  const followingMatch = path.match(/^\/([^/?#]+)\/following\/?$/);
  if (followingMatch) {
    router.push({ pathname: "/[username]/following", params: { username: followingMatch[1] } });
    return;
  }

  // Every other known top-level namespace this app doesn't have a native
  // screen for yet (marketplace items, businesses' sub-pages, ...) falls
  // through below — checked before the bare-username catch-all so e.g.
  // "/feed" or "/notifications" don't get misread as a username.
  const reservedFirstSegment = /^\/(c|b|e|m|messages|feed|notifications|login|signup|s)(\/|$)/;
  const usernameMatch = !reservedFirstSegment.test(path) && path.match(/^\/([^/?#]+)\/?$/);
  if (usernameMatch) {
    router.push({ pathname: "/[username]", params: { username: usernameMatch[1] } });
    return;
  }

  // Honest fallback: no native screen covers this path yet, so open it in
  // the system browser rather than pretending full in-app coverage.
  WebBrowser.openBrowserAsync(`${API_BASE_URL}${path}`).catch(() => {});
}
