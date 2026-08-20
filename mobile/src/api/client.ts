import { API_BASE_URL } from "../config";
import { loadTokens } from "../auth/tokenStorage";
import { fetchWithTimeout, isAbortError } from "./http";
import type {
  Me,
  Profile,
  Post,
  FeedResponse,
  NotificationsResponse,
  FollowStatus,
  NotificationPreferenceChannel,
  NotificationPreferencesResponse,
} from "./types";
import type { NativePlatform } from "../config";

// A locally-picked image (expo-image-picker's asset shape, loosely) —
// mimeType/fileName are optional there too, so a fallback is chosen at the
// FormData append site rather than assumed present.
export type LocalImage = { uri: string; mimeType?: string | null; fileName?: string | null };

// React Native's fetch/FormData accepts this {uri,name,type} object in
// place of a real File/Blob for a multipart field — the one RN-specific
// wrinkle in an otherwise standard FormData upload, centralized here so
// every upload call site doesn't repeat the same fallback logic.
function appendImage(form: FormData, field: string, image: LocalImage, index: number) {
  form.append(field, {
    uri: image.uri,
    name: image.fileName ?? `${field}-${index}.jpg`,
    type: image.mimeType ?? "image/jpeg",
  } as unknown as Blob);
}

// apiError (api-auth.ts) always responds { error: string } on the server
// side — mirrored here so a caller sees the server's actual message
// ("This request requires the 'profile:read' scope...") instead of a
// generic "Request failed". status 0 marks a network-level failure (no
// real HTTP response), distinct from a genuine 401 — callers should never
// treat the two the same (a timeout doesn't mean "sign in again").
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Media uploads (image posts, avatar/cover edits) need more time on a slow
// connection than a plain JSON request, and get their own longer budget
// rather than raising the default for every call.
const UPLOAD_TIMEOUT_MS = 45000;

async function authorizedRequest<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T> {
  const tokens = await loadTokens();
  if (!tokens) throw new ApiError("Not signed in.", 401);

  // FormData bodies (multipart uploads) must NOT get an explicit
  // Content-Type — fetch sets its own with the multipart boundary, and a
  // hardcoded "application/json" here would silently break every upload
  // call rather than just failing loudly.
  const isFormData = init?.body instanceof FormData;

  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${API_BASE_URL}${path}`,
      {
        ...init,
        headers: { ...init?.headers, Authorization: `Bearer ${tokens.accessToken}`, ...(isFormData ? {} : { "Content-Type": "application/json" }) },
      },
      timeoutMs
    );
  } catch (err) {
    if (isAbortError(err)) throw new ApiError("Request timed out. Check your connection and try again.", 0);
    throw err;
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    // 401 here means the token itself is dead (expired or revoked) — since
    // there's no refresh-token grant yet (build plan step 3's flagged
    // follow-up), the caller's only real recovery is signIn() again, not a
    // silent retry.
    throw new ApiError(body?.error ?? `Request failed (${res.status}).`, res.status);
  }

  return res.json() as Promise<T>;
}

export function getMe(): Promise<Me> {
  return authorizedRequest<Me>("/api/v1/users/me");
}

export function getProfile(username: string): Promise<Profile> {
  return authorizedRequest<Profile>(`/api/v1/profiles/${encodeURIComponent(username)}`);
}

export function getPost(id: string): Promise<Post> {
  return authorizedRequest<Post>(`/api/v1/posts/${encodeURIComponent(id)}`);
}

export function getFeed(cursor?: string | null): Promise<FeedResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return authorizedRequest<FeedResponse>(`/api/v1/feed${query}`);
}

export function getNotifications(cursor?: string | null): Promise<NotificationsResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return authorizedRequest<NotificationsResponse>(`/api/v1/notifications${query}`);
}

export function markNotificationsRead(): Promise<{ ok: true }> {
  return authorizedRequest<{ ok: true }>("/api/v1/notifications", { method: "PATCH" });
}

// Build plan step 5, against step 2's /api/v1/device-tokens route.
export function registerDeviceToken(args: { platform: NativePlatform; token: string }): Promise<{ ok: true }> {
  return authorizedRequest<{ ok: true }>("/api/v1/device-tokens", { method: "POST", body: JSON.stringify(args) });
}

export function unregisterDeviceToken(token: string): Promise<{ ok: true }> {
  return authorizedRequest<{ ok: true }>("/api/v1/device-tokens", { method: "DELETE", body: JSON.stringify({ token }) });
}

// Phase B (interaction parity): each of these hits a route added
// specifically for this — see src/app/api/v1/posts/[id]/{like,repost} and
// /posts and /profiles/[username]/follow on the web app.
export function likePost(id: string): Promise<{ liked: boolean; likeCount: number }> {
  return authorizedRequest(`/api/v1/posts/${encodeURIComponent(id)}/like`, { method: "POST" });
}

export function repostPost(id: string): Promise<{ reposted: boolean; repostCount: number }> {
  return authorizedRequest(`/api/v1/posts/${encodeURIComponent(id)}/repost`, { method: "POST" });
}

export function followUser(username: string): Promise<{ status: FollowStatus }> {
  return authorizedRequest(`/api/v1/profiles/${encodeURIComponent(username)}/follow`, { method: "POST" });
}

export function unfollowUser(username: string): Promise<{ ok: true }> {
  return authorizedRequest(`/api/v1/profiles/${encodeURIComponent(username)}/follow`, { method: "DELETE" });
}

// Plain JSON when there's no media (cheaper, matches the original Phase B
// shape); multipart only when the caller actually attached images — see
// POST /api/v1/posts's own dual-mode handling on the server.
export function createPost(args: { body: string; replyToId?: string; media?: LocalImage[] }): Promise<Post> {
  if (!args.media || args.media.length === 0) {
    return authorizedRequest<Post>("/api/v1/posts", {
      method: "POST",
      body: JSON.stringify({ body: args.body, replyToId: args.replyToId }),
    });
  }
  const form = new FormData();
  form.append("body", args.body);
  if (args.replyToId) form.append("replyToId", args.replyToId);
  args.media.forEach((image, index) => appendImage(form, "media", image, index));
  return authorizedRequest<Post>("/api/v1/posts", { method: "POST", body: form }, UPLOAD_TIMEOUT_MS);
}

// Phase C (rich profile). getUserPosts backs the profile's "Posts" tab —
// same FeedResponse shape the main feed uses, just scoped to one author.
export function getUserPosts(username: string, cursor?: string | null): Promise<FeedResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return authorizedRequest<FeedResponse>(`/api/v1/profiles/${encodeURIComponent(username)}/posts${query}`);
}

export function updateProfile(args: { displayName?: string; bio?: string; avatar?: LocalImage; cover?: LocalImage }): Promise<Profile> {
  const hasFiles = args.avatar || args.cover;
  if (!hasFiles) {
    return authorizedRequest<Profile>("/api/v1/users/me", {
      method: "PATCH",
      body: JSON.stringify({ displayName: args.displayName, bio: args.bio }),
    });
  }
  const form = new FormData();
  if (args.displayName !== undefined) form.append("displayName", args.displayName);
  if (args.bio !== undefined) form.append("bio", args.bio);
  if (args.avatar) appendImage(form, "avatar", args.avatar, 0);
  if (args.cover) appendImage(form, "cover", args.cover, 0);
  return authorizedRequest<Profile>("/api/v1/users/me", { method: "PATCH", body: form }, UPLOAD_TIMEOUT_MS);
}

export function getNotificationPreferences(): Promise<NotificationPreferencesResponse> {
  return authorizedRequest<NotificationPreferencesResponse>("/api/v1/notification-preferences");
}

export function updateNotificationPreference(args: {
  notificationType: string;
  channel: NotificationPreferenceChannel;
  enabled: boolean;
}): Promise<{ ok: true }> {
  return authorizedRequest<{ ok: true }>("/api/v1/notification-preferences", { method: "PATCH", body: JSON.stringify(args) });
}
