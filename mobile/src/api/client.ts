import { File } from "expo-file-system";
import { API_BASE_URL } from "../config";
import { loadTokens, saveTokens, clearTokens } from "../auth/tokenStorage";
import { refreshAccessToken, RefreshFailedError } from "../auth/pkceAuth";
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
  SearchUsersResponse,
  FollowListResponse,
  CommunitySearchResponse,
  BusinessSearchResponse,
  EventSearchResponse,
  UnreadCounts,
  ConversationsResponse,
  MessagesResponse,
  MessageItem,
  MessageableCandidate,
  CommunitiesResponse,
  CommunityDetail,
  CommunityChatMessage,
  CommunityChatResponse,
  VoiceRoomSummary,
  VoiceRoomDetail,
  VoiceRoomAction,
  LiveKitToken,
  BusinessesResponse,
  BusinessDetail,
  MarketplaceResponse,
  MarketplaceCategory,
  EventsResponse,
  EventDetail,
  EventRsvpStatus,
  WalletResponse,
  PrivacySettings,
  BlockedUsersResponse,
  SessionsResponse,
  TwoFactorStatus,
  TwoFactorEnrollment,
  RecoveryCodes,
  PreferencesResponse,
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
  // A plain { uri, name, type } object — the long-standing RN convention —
  // throws "Unsupported FormDataPart implementation" under Expo SDK 57's
  // fetch (expo/src/winter/fetch/convertFormData.ts, whose own comment
  // says outright: "uri is not supported for React Native's FormData").
  // That converter accepts a real Blob or anything exposing `.bytes()`
  // (File/ExpoBlob) — expo-file-system's File implements exactly that
  // (plus `.name`/`.type`, which the multipart header logic also reads
  // straight off the appended value), so wrapping the picked URI in one
  // is the fix, not a new upload mechanism.
  const file = new File(image.uri);
  // File infers .type from the URI's own extension, which can be wrong or
  // missing (e.g. a cropped/cached image with a generic filename) — when
  // the picker told us the real mimeType, override the blob's type with it
  // rather than trust the inferred one, since it's what actually reaches
  // the server's declared-Content-Type check (commit 642fd17).
  const blob = image.mimeType ? file.slice(0, undefined, image.mimeType) : (file as unknown as Blob);
  form.append(field, blob, image.fileName ?? `${field}-${index}.jpg`);
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

// Concurrent 401s (several screens' requests landing at once) must share a
// single refresh attempt rather than each redeeming the refresh token —
// oauth.ts's refreshAccessToken rotates on every use, so a second racing
// call presenting the now-superseded refresh token would get "Invalid
// refresh token" and force a real sign-out for no reason. Module-level
// (not per-call) so every authorizedRequest caller sees the same in-flight
// attempt.
let refreshInFlight: Promise<boolean> | null = null;

function tryRefreshTokens(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const current = await loadTokens();
      if (!current) return false;
      try {
        const refreshed = await refreshAccessToken(current.refreshToken);
        await saveTokens(refreshed);
        return true;
      } catch (err) {
        // Only clear the stored session when the server actually rejected
        // the refresh token — a network-level failure says nothing about
        // whether it's still good, so the existing tokens are left in
        // place for the next attempt (see RefreshFailedError's comment).
        if (err instanceof RefreshFailedError && err.invalidGrant) await clearTokens();
        return false;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function authorizedRequest<T>(
  path: string,
  init?: RequestInit,
  timeoutMs?: number,
  isRetry = false,
  parseAs: "json" | "text" = "json"
): Promise<T> {
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

  // A 401 here means the access token is dead — expired (the common case)
  // or revoked. Try exactly one silent refresh-and-retry before surfacing
  // it; isRetry stops this from looping if the refreshed token still
  // 401s (e.g. the authorization was revoked server-side, which
  // invalidates the refresh token too, so refresh itself fails first).
  if (res.status === 401 && !isRetry && (await tryRefreshTokens())) {
    return authorizedRequest<T>(path, init, timeoutMs, true, parseAs);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    // Reaching here on a 401 means refresh didn't recover the session (or
    // wasn't attempted, e.g. this already is the retry) — the caller's
    // only real recovery is signing in again.
    throw new ApiError(body?.error ?? `Request failed (${res.status}).`, res.status);
  }

  return (parseAs === "text" ? res.text() : res.json()) as Promise<T>;
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

// Mobile pro-upgrade addendum, sub-phase M13 (long-press quick actions,
// own-post Delete). Mirrors actions/posts.ts's deletePost — soft delete,
// author-only (enforced server-side, not just hidden client-side).
export function deletePost(id: string): Promise<{ ok: true }> {
  return authorizedRequest(`/api/v1/posts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function toggleBookmark(id: string): Promise<{ bookmarked: boolean }> {
  return authorizedRequest(`/api/v1/posts/${encodeURIComponent(id)}/bookmark`, { method: "POST" });
}

export function getBookmarks(cursor?: string | null): Promise<FeedResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return authorizedRequest<FeedResponse>(`/api/v1/bookmarks${query}`);
}

export function getUnreadCounts(): Promise<UnreadCounts> {
  return authorizedRequest<UnreadCounts>("/api/v1/unread-counts");
}

export function getFollowers(username: string, cursor?: string | null): Promise<FollowListResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return authorizedRequest<FollowListResponse>(`/api/v1/profiles/${encodeURIComponent(username)}/followers${query}`);
}

export function getFollowing(username: string, cursor?: string | null): Promise<FollowListResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return authorizedRequest<FollowListResponse>(`/api/v1/profiles/${encodeURIComponent(username)}/following${query}`);
}

export function searchUsers(q: string): Promise<SearchUsersResponse> {
  return authorizedRequest<SearchUsersResponse>(`/api/v1/search?type=users&q=${encodeURIComponent(q)}`);
}

export function searchPosts(q: string, cursor?: string | null): Promise<FeedResponse> {
  const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
  return authorizedRequest<FeedResponse>(`/api/v1/search?type=posts&q=${encodeURIComponent(q)}${cursorQuery}`);
}

// Mobile pro-upgrade addendum, sub-phase M13 — widened Explore search.
// None of these four paginate (mirrors GET /api/v1/search's own
// per-type behavior: only posts/users cursor today).
export function searchCommunities(q: string): Promise<CommunitySearchResponse> {
  return authorizedRequest<CommunitySearchResponse>(`/api/v1/search?type=communities&q=${encodeURIComponent(q)}`);
}

export function searchBusinesses(q: string): Promise<BusinessSearchResponse> {
  return authorizedRequest<BusinessSearchResponse>(`/api/v1/search?type=businesses&q=${encodeURIComponent(q)}`);
}

export function searchEvents(q: string): Promise<EventSearchResponse> {
  return authorizedRequest<EventSearchResponse>(`/api/v1/search?type=events&q=${encodeURIComponent(q)}`);
}

export function searchMarketplace(q: string): Promise<MarketplaceResponse> {
  return authorizedRequest<MarketplaceResponse>(`/api/v1/search?type=marketplace&q=${encodeURIComponent(q)}`);
}

// Sub-phase M3 (Messages/DMs). Polling-based, no live socket — see
// GET /api/v1/conversations' own comment for why.
export function getConversations(cursor?: string | null): Promise<ConversationsResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return authorizedRequest<ConversationsResponse>(`/api/v1/conversations${query}`);
}

export function getMessageCandidates(): Promise<{ items: MessageableCandidate[] }> {
  return authorizedRequest(`/api/v1/conversations/candidates`);
}

export function startConversation(args: { recipientId: string; body: string }): Promise<{ conversationId: string; message: MessageItem }> {
  return authorizedRequest(`/api/v1/conversations`, { method: "POST", body: JSON.stringify(args) });
}

export function getMessages(conversationId: string, cursor?: string | null): Promise<MessagesResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return authorizedRequest<MessagesResponse>(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages${query}`);
}

export type MessageAttachmentUpload = {
  uri: string;
  name: string;
  mimeType: string;
  kind: "voice_note" | "file";
  durationS?: number | null;
};

// Mobile pro-upgrade addendum, sub-phase M13 (voice notes + file attach).
// Same dual JSON/multipart split every other upload-capable endpoint in
// this file already uses (appendImage's own comment) — plain JSON stays
// the common case (no attachment), multipart only pays for itself when
// one is actually attached.
export function sendConversationMessage(
  conversationId: string,
  body: string,
  attachment?: MessageAttachmentUpload
): Promise<MessageItem> {
  const path = `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`;
  if (!attachment) {
    return authorizedRequest(path, { method: "POST", body: JSON.stringify({ body }) });
  }
  const form = new FormData();
  form.append("body", body);
  form.append("attachmentKind", attachment.kind);
  if (attachment.durationS != null) form.append("attachmentDurationS", String(attachment.durationS));
  const file = new File(attachment.uri);
  form.append("attachment", file.slice(0, undefined, attachment.mimeType), attachment.name);
  return authorizedRequest(path, { method: "POST", body: form }, UPLOAD_TIMEOUT_MS);
}

export function markConversationRead(conversationId: string): Promise<{ ok: true }> {
  return authorizedRequest(`/api/v1/conversations/${encodeURIComponent(conversationId)}/read`, { method: "PATCH" });
}

// Sub-phase M4 (Communities).
export function getCommunities(): Promise<CommunitiesResponse> {
  return authorizedRequest<CommunitiesResponse>("/api/v1/communities");
}

export function getCommunity(slug: string): Promise<CommunityDetail> {
  return authorizedRequest<CommunityDetail>(`/api/v1/communities/${encodeURIComponent(slug)}`);
}

export function joinCommunity(slug: string): Promise<{ status: string }> {
  return authorizedRequest(`/api/v1/communities/${encodeURIComponent(slug)}/join`, { method: "POST" });
}

export function leaveCommunity(slug: string): Promise<{ ok: true }> {
  return authorizedRequest(`/api/v1/communities/${encodeURIComponent(slug)}/join`, { method: "DELETE" });
}

export function getCommunityPosts(slug: string, cursor?: string | null): Promise<FeedResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return authorizedRequest<FeedResponse>(`/api/v1/communities/${encodeURIComponent(slug)}/posts${query}`);
}

export function createCommunityPost(slug: string, body: string): Promise<Post> {
  return authorizedRequest(`/api/v1/communities/${encodeURIComponent(slug)}/posts`, { method: "POST", body: JSON.stringify({ body }) });
}

// Realtime addendum Phase C — community live chat.
export function getCommunityChat(slug: string, cursor?: string | null): Promise<CommunityChatResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return authorizedRequest<CommunityChatResponse>(`/api/v1/communities/${encodeURIComponent(slug)}/chat${query}`);
}

export function sendCommunityChatMessage(slug: string, body: string): Promise<CommunityChatMessage> {
  return authorizedRequest(`/api/v1/communities/${encodeURIComponent(slug)}/chat`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function deleteCommunityChatMessage(slug: string, messageId: string): Promise<{ ok: true }> {
  return authorizedRequest(
    `/api/v1/communities/${encodeURIComponent(slug)}/chat/${encodeURIComponent(messageId)}`,
    { method: "DELETE" }
  );
}

// Fire-and-forget "someone is typing" ping — the caller debounces.
export function sendCommunityChatTyping(slug: string): Promise<{ ok: true }> {
  return authorizedRequest(`/api/v1/communities/${encodeURIComponent(slug)}/chat/typing`, { method: "POST" });
}

// Realtime addendum Phase D — community voice rooms (LiveKit).
export function getCommunityVoiceRooms(slug: string): Promise<{ items: VoiceRoomSummary[] }> {
  return authorizedRequest(`/api/v1/communities/${encodeURIComponent(slug)}/voice`);
}

export function getVoiceRoom(slug: string, roomId: string): Promise<VoiceRoomDetail> {
  return authorizedRequest(`/api/v1/communities/${encodeURIComponent(slug)}/voice/${encodeURIComponent(roomId)}`);
}

export function voiceRoomAction(slug: string, roomId: string, action: VoiceRoomAction): Promise<{ ok: true }> {
  return authorizedRequest(
    `/api/v1/communities/${encodeURIComponent(slug)}/voice/${encodeURIComponent(roomId)}/action`,
    { method: "POST", body: JSON.stringify({ action }) }
  );
}

export function getVoiceRoomToken(slug: string, roomId: string): Promise<LiveKitToken> {
  return authorizedRequest(
    `/api/v1/communities/${encodeURIComponent(slug)}/voice/${encodeURIComponent(roomId)}/token`,
    { method: "POST" }
  );
}

export function createVoiceRoom(slug: string, title: string): Promise<{ id: string }> {
  return authorizedRequest(`/api/v1/communities/${encodeURIComponent(slug)}/voice`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

// Sub-phase M5 (Businesses + Marketplace) — both browse-only, purchase/
// contact/booking hand off to the browser (see the server routes' own
// comments for why).
export function getBusinesses(): Promise<BusinessesResponse> {
  return authorizedRequest<BusinessesResponse>("/api/v1/businesses");
}

export function getBusiness(slug: string): Promise<BusinessDetail> {
  return authorizedRequest<BusinessDetail>(`/api/v1/businesses/${encodeURIComponent(slug)}`);
}

export function getMarketplace(category?: MarketplaceCategory | null, q?: string): Promise<MarketplaceResponse> {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (q) params.set("q", q);
  const query = params.toString() ? `?${params.toString()}` : "";
  return authorizedRequest<MarketplaceResponse>(`/api/v1/marketplace${query}`);
}

// Sub-phase M6 (Events + Wallet).
export function getEvents(): Promise<EventsResponse> {
  return authorizedRequest<EventsResponse>("/api/v1/events");
}

export function getEvent(slug: string): Promise<EventDetail> {
  return authorizedRequest<EventDetail>(`/api/v1/events/${encodeURIComponent(slug)}`);
}

export function rsvpToEvent(slug: string, status: EventRsvpStatus): Promise<{ status: EventRsvpStatus }> {
  return authorizedRequest(`/api/v1/events/${encodeURIComponent(slug)}/rsvp`, { method: "POST", body: JSON.stringify({ status }) });
}

export function getWallet(): Promise<WalletResponse> {
  return authorizedRequest<WalletResponse>("/api/v1/wallet");
}

export function transferCoins(args: { username: string; coinAmount: number }): Promise<{ ok: true }> {
  return authorizedRequest("/api/v1/wallet/transfer", { method: "POST", body: JSON.stringify(args) });
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

export function updateProfile(args: {
  displayName?: string;
  bio?: string;
  isPrivate?: boolean;
  themePreset?: string;
  avatar?: LocalImage;
  cover?: LocalImage;
}): Promise<Profile> {
  const hasFiles = args.avatar || args.cover;
  if (!hasFiles) {
    return authorizedRequest<Profile>("/api/v1/users/me", {
      method: "PATCH",
      body: JSON.stringify({ displayName: args.displayName, bio: args.bio, isPrivate: args.isPrivate, themePreset: args.themePreset }),
    });
  }
  const form = new FormData();
  if (args.displayName !== undefined) form.append("displayName", args.displayName);
  if (args.bio !== undefined) form.append("bio", args.bio);
  if (args.isPrivate !== undefined) form.append("isPrivate", String(args.isPrivate));
  if (args.themePreset !== undefined) form.append("themePreset", args.themePreset);
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

// M12 (settings/account parity) — one function per /api/v1 route added for
// that sub-phase; see this addendum's own plan doc for the full route list.

export function getPrivacySettings(): Promise<PrivacySettings> {
  return authorizedRequest<PrivacySettings>("/api/v1/privacy");
}

export function updatePrivacySettings(args: Partial<PrivacySettings>): Promise<PrivacySettings> {
  return authorizedRequest<PrivacySettings>("/api/v1/privacy", { method: "PATCH", body: JSON.stringify(args) });
}

export function getBlockedUsers(cursor?: string | null): Promise<BlockedUsersResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return authorizedRequest<BlockedUsersResponse>(`/api/v1/blocks${query}`);
}

export function blockUser(username: string): Promise<{ ok: true }> {
  return authorizedRequest<{ ok: true }>("/api/v1/blocks", { method: "POST", body: JSON.stringify({ username }) });
}

export function unblockUser(userId: string): Promise<{ ok: true }> {
  return authorizedRequest<{ ok: true }>(`/api/v1/blocks/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

export function getSessions(): Promise<SessionsResponse> {
  return authorizedRequest<SessionsResponse>("/api/v1/account/sessions");
}

export function revokeSession(id: string): Promise<{ ok: true }> {
  return authorizedRequest<{ ok: true }>(`/api/v1/account/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function revokeOtherSessions(): Promise<{ ok: true }> {
  return authorizedRequest<{ ok: true }>("/api/v1/account/sessions/revoke-others", { method: "POST" });
}

export function changePassword(args: { currentPassword: string; newPassword: string }): Promise<{ ok: true }> {
  return authorizedRequest<{ ok: true }>("/api/v1/account/password", { method: "POST", body: JSON.stringify(args) });
}

export function requestEmailChange(args: { currentPassword: string; newEmail: string }): Promise<{ ok: true }> {
  return authorizedRequest<{ ok: true }>("/api/v1/account/contact/email", { method: "POST", body: JSON.stringify(args) });
}

export function requestPhoneChange(args: { currentPassword: string; phoneDialCode: string; phoneNumber: string }): Promise<{ ok: true }> {
  return authorizedRequest<{ ok: true }>("/api/v1/account/contact/phone", { method: "POST", body: JSON.stringify(args) });
}

export function confirmPhoneChange(code: string): Promise<{ ok: true }> {
  return authorizedRequest<{ ok: true }>("/api/v1/account/contact/phone/confirm", { method: "POST", body: JSON.stringify({ code }) });
}

export function getTwoFactorStatus(): Promise<TwoFactorStatus> {
  return authorizedRequest<TwoFactorStatus>("/api/v1/account/two-factor");
}

export function enrollTwoFactor(): Promise<TwoFactorEnrollment> {
  return authorizedRequest<TwoFactorEnrollment>("/api/v1/account/two-factor/enroll", { method: "POST" });
}

export function confirmTwoFactor(code: string): Promise<RecoveryCodes> {
  return authorizedRequest<RecoveryCodes>("/api/v1/account/two-factor/confirm", { method: "POST", body: JSON.stringify({ code }) });
}

export function disableTwoFactor(currentPassword: string): Promise<{ ok: true }> {
  return authorizedRequest<{ ok: true }>("/api/v1/account/two-factor/disable", { method: "POST", body: JSON.stringify({ currentPassword }) });
}

export function regenerateRecoveryCodes(currentPassword: string): Promise<RecoveryCodes> {
  return authorizedRequest<RecoveryCodes>("/api/v1/account/two-factor/recovery-codes", {
    method: "POST",
    body: JSON.stringify({ currentPassword }),
  });
}

export function deactivateAccount(currentPassword: string): Promise<{ ok: true }> {
  return authorizedRequest<{ ok: true }>("/api/v1/account/lifecycle/deactivate", { method: "POST", body: JSON.stringify({ currentPassword }) });
}

export function deleteAccount(currentPassword: string): Promise<{ ok: true }> {
  return authorizedRequest<{ ok: true }>("/api/v1/account/lifecycle/delete", { method: "POST", body: JSON.stringify({ currentPassword }) });
}

// Returns the raw exported JSON as text — the caller (account-management.tsx)
// writes it to a file via expo-file-system and hands it to the share sheet,
// so there's no benefit to parsing it here first. Routed through
// authorizedRequest (parseAs: "text") rather than a standalone fetch so an
// expired access token gets the same silent refresh-and-retry every other
// call gets, instead of surfacing a bare 401 only on this one screen.
export function exportAccountData(): Promise<string> {
  return authorizedRequest<string>("/api/v1/account/export", undefined, undefined, false, "text");
}

export function getPreferences(): Promise<PreferencesResponse> {
  return authorizedRequest<PreferencesResponse>("/api/v1/preferences");
}

export function updatePreferences(args: { locale?: string; timezone?: string; fontScale?: string; highContrast?: boolean }): Promise<PreferencesResponse> {
  return authorizedRequest<PreferencesResponse>("/api/v1/preferences", { method: "PATCH", body: JSON.stringify(args) });
}
