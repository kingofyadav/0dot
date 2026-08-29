// Client-only helpers for the browser tab (favicon + title) reacting to
// live app state — unread counts, unsaved form changes, save/publish
// progress, and connectivity. Kept framework-free (no React) so the
// priority/compositing logic is easy to reason about and reuse from both
// BrowserTabProvider and any component that needs the raw pieces.

export type Theme = "light" | "dark";
export type FlashStatus = "saving" | "success" | "error";

export interface FlashState {
  status: FlashStatus;
  message?: string;
}

export interface BrowserTabInputs {
  baseTitle: string;
  unreadCount: number;
  isDirty: boolean;
  isOffline: boolean;
  flash: FlashState | null;
}

export type FaviconSpec =
  | { kind: "normal" }
  | { kind: "offline" }
  | { kind: "dot"; color: string }
  | { kind: "count"; count: number }
  | { kind: "check" }
  | { kind: "warning" };

export interface ResolvedTab {
  title: string;
  favicon: FaviconSpec;
}

const SUFFIX = "0dot";
// Canvas fillStyle can't read CSS custom properties, so these track the
// brand palette in globals.css (--accent/--warning/--success/--danger)
// manually — update alongside any future palette change.
const SAVING_DOT = "#4285f4";
const UNSAVED_DOT = "#fbbc04";

// Highest-priority state wins outright rather than combining (e.g. an
// unsaved dot never competes with an in-flight save) — matches how mature
// tab-status UIs (Slack, Gmail, Notion) collapse to a single signal instead
// of stacking badges.
export function resolveTabState(inputs: BrowserTabInputs): ResolvedTab {
  const { baseTitle, unreadCount, isDirty, isOffline, flash } = inputs;

  if (isOffline) {
    return { title: `Offline · ${SUFFIX}`, favicon: { kind: "offline" } };
  }
  if (flash?.status === "error") {
    return {
      title: `⚠ ${flash.message ?? "Something went wrong"} · ${SUFFIX}`,
      favicon: { kind: "warning" },
    };
  }
  if (flash?.status === "saving") {
    return {
      title: `${flash.message ?? "Saving…"} · ${SUFFIX}`,
      favicon: { kind: "dot", color: SAVING_DOT },
    };
  }
  if (flash?.status === "success") {
    return {
      title: `${flash.message ?? "Saved"} ✓ · ${SUFFIX}`,
      favicon: { kind: "check" },
    };
  }
  if (isDirty) {
    return {
      title: `● Unsaved changes · ${baseTitle}`,
      favicon: { kind: "dot", color: UNSAVED_DOT },
    };
  }
  if (unreadCount > 0) {
    const label = unreadCount > 99 ? "99+" : String(unreadCount);
    return { title: `(${label}) ${baseTitle}`, favicon: { kind: "count", count: unreadCount } };
  }
  return { title: baseTitle, favicon: { kind: "normal" } };
}

const THEME_STORAGE_KEY = "0dot-theme";

// dark theme uses the dark-fill mark (0dot.png), light theme uses the
// light-fill mark (1dot.png) — same mapping the header/avatar logo uses.
export function iconHrefFor(theme: Theme): string {
  return theme === "dark" ? "/0dot.png" : "/1dot.png";
}

export function getEffectiveTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function persistTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function setFaviconHref(href: string): void {
  document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]').forEach((link) => {
    // Recreate the node rather than mutate .href in place: some WebKit/
    // Safari versions don't repaint the tab favicon on a plain attribute
    // mutation of an already-attached <link>, only on a genuinely new node.
    // Cloning first preserves the tag's other attributes (media, sizes,
    // type) — only href changes. No downside on browsers where mutating
    // in place already worked.
    const fresh = link.cloneNode(false) as HTMLLinkElement;
    fresh.href = href;
    link.replaceWith(fresh);
  });
}

const imageCache = new Map<string, HTMLImageElement>();

function loadImage(href: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(href);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(href, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = href;
  });
}

const BADGE_FILL: Record<"check" | "warning" | "count", string> = {
  check: "#34a853",
  warning: "#ea4335",
  count: "#ea4335",
};

// Composites a small status badge onto the base logo at draw time instead
// of shipping a pre-baked PNG per state — keeps every future state a few
// lines of canvas code rather than a new asset.
export async function renderFaviconDataUrl(baseHref: string, spec: FaviconSpec): Promise<string> {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return baseHref;

  const img = await loadImage(baseHref);

  if (spec.kind === "offline") {
    ctx.filter = "grayscale(1) opacity(0.45)";
  }
  ctx.drawImage(img, 0, 0, size, size);
  ctx.filter = "none";

  if (spec.kind === "normal" || spec.kind === "offline") {
    return canvas.toDataURL("image/png");
  }

  const cx = size - 17;
  const cy = 17;

  if (spec.kind === "dot") {
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fillStyle = spec.color;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.fill();
    ctx.stroke();
    return canvas.toDataURL("image/png");
  }

  const label = spec.kind === "count" ? (spec.count > 99 ? "99+" : String(spec.count)) : spec.kind === "check" ? "✓" : "!";
  const radius = label.length > 2 ? 18 : 15;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = BADGE_FILL[spec.kind];
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.font = `700 ${label.length > 2 ? 16 : 20}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, cy + 1);

  return canvas.toDataURL("image/png");
}

// Mirrors the in-tab unread badge onto the OS-level app icon (taskbar/dock/
// home screen) via the Badging API — supported only in installed/standalone
// contexts on some platforms, so a no-op silent-fail is correct behavior
// here, not an error to surface.
export function syncAppBadge(count: number): void {
  if (!("setAppBadge" in navigator)) return;
  (count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {});
}

const UNREAD_CHANNEL_NAME = "0dot-unread-sync";
let unreadChannel: BroadcastChannel | null = null;

function getUnreadChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  return (unreadChannel ??= new BroadcastChannel(UNREAD_CHANNEL_NAME));
}

// Lets every open tab of the same logged-in user learn a count the instant
// any one of them does, instead of each tab's own MessagingProvider having
// to independently catch up via its own SSE event or visibility change.
export function broadcastUnreadCount(count: number): void {
  getUnreadChannel()?.postMessage(count);
}

export function subscribeUnreadCount(onCount: (count: number) => void): () => void {
  const channel = getUnreadChannel();
  if (!channel) return () => {};
  const handler = (event: MessageEvent<number>) => onCount(event.data);
  channel.addEventListener("message", handler);
  return () => channel.removeEventListener("message", handler);
}
