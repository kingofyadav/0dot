// Mirrors each /api/v1/* route's Response.json() shape exactly (see
// src/app/api/v1/{users/me,profiles/[username],posts/[id]}/route.ts on the
// server) — no independent serialization guesses.

export type Me = {
  id: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  themePreset: string | null;
  isPrivate: boolean;
  isPremium: boolean;
};

export type FollowStatus = "none" | "pending" | "accepted";

export type Profile = {
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  isVerified: boolean;
  isPremium: boolean;
  followerCount: number;
  followingCount: number;
  isOwnProfile: boolean;
  followStatus: FollowStatus | null;
};

export type PostMedia = { url: string; position: number };

export type Post = {
  id: string;
  body: string;
  author: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  authorVerified: boolean;
  likeCount: number;
  replyCount: number;
  repostCount: number;
  isLiked: boolean;
  isBookmarked: boolean;
  media: PostMedia[];
  createdAt: string;
};

export type FeedResponse = {
  items: Post[];
  nextCursor: string | null;
};

export type NotificationItem = {
  id: string;
  type: string;
  subjectType: string;
  subjectId: string;
  verb: string;
  href: string;
  actor: { username: string | null; displayName: string | null; avatarUrl: string | null; isVerified: boolean } | null;
  isRead: boolean;
  createdAt: string;
};

export type NotificationsResponse = {
  unreadCount: number;
  items: NotificationItem[];
  nextCursor: string | null;
};

export type NotificationPreferenceChannel = "push" | "email";

export type NotificationPreferencesResponse = {
  push: { type: string; enabled: boolean }[];
  email: { type: string; enabled: boolean }[];
  deviceCount: number;
};

// Mobile pro-upgrade addendum, sub-phase M2 — mirrors GET /api/v1/search's
// two response shapes exactly (see that route on the server).
export type SearchUser = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
};

export type SearchUsersResponse = { items: SearchUser[] };

// Mobile pro-upgrade addendum, sub-phase M13 (followers/following lists).
// Same SearchUser row shape UserRow already renders, just cursor-paginated
// like FeedResponse rather than the one-shot SearchUsersResponse.
export type FollowListResponse = { items: SearchUser[]; nextCursor: string | null };

// Mobile pro-upgrade addendum, sub-phase M3 — mirrors the /api/v1/conversations*
// routes' response shapes exactly (see those routes on the server).
export type ConversationSummary = {
  id: string;
  kind: string;
  title: string;
  handle: string | null;
  avatarUrl: string | null;
  otherUserId: string | null;
  // Mobile pro-upgrade addendum, sub-phase M13 (active/last-seen). Mirrors
  // getConversationDisplayInfo's own otherUserId/otherLastActiveAt split —
  // isOnline is presence.ts's in-memory "has an open SSE tab" read, taken
  // once per request; otherLastActiveAt is the DB-persisted fallback for
  // when they don't.
  isOnline: boolean;
  otherLastActiveAt: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  isUnread: boolean;
  isRequest: boolean;
};

export type ConversationsResponse = { unreadCount: number; items: ConversationSummary[]; nextCursor: string | null };

// Mobile pro-upgrade addendum, sub-phase M13 (tab-bar unread badges).
export type UnreadCounts = { messages: number; notifications: number };

export type MessageableCandidate = {
  userId: string;
  handle: string | null;
  displayName: string;
  avatarUrl: string | null;
};

export type MessageItem = {
  id: string;
  body: string | null;
  senderId: string;
  attachmentType: string | null;
  attachmentUrl: string | null;
  attachmentMimeType: string | null;
  attachmentDurationS: number | null;
  createdAt: string;
  deletedAt: string | null;
};

export type MessagesResponse = { items: MessageItem[]; nextCursor: string | null };

// Mobile pro-upgrade addendum, sub-phases M4-M6 — mirror the corresponding
// /api/v1/{communities,businesses,marketplace,events,wallet}* routes'
// response shapes exactly (see those routes on the server).

export type CommunitySummary = {
  slug: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  memberCount: number;
  visibility: string;
};

export type CommunitiesResponse = { joined: CommunitySummary[]; discover: CommunitySummary[] };

export type CommunityMembership = { role: string; status: string } | null;

export type CommunityDetail = {
  slug: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  visibility: string;
  memberCount: number;
  canViewContent: boolean;
  membership: CommunityMembership;
};

// Realtime addendum Phase C — community live chat.
export type CommunityChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  senderId: string;
  senderHandle: string | null;
  senderName: string | null;
  senderAvatarUrl: string | null;
};

export type CommunityChatResponse = {
  items: CommunityChatMessage[];
  nextCursor: string | null;
  canSend: boolean;
};

// Realtime addendum Phase D — community voice rooms (LiveKit).
export type VoiceRoomSummary = {
  id: string;
  title: string;
  status: string;
  startsAt: string;
  createdBy: string;
  creatorName: string | null;
  floorFree: boolean;
};

export type VoiceRoomParticipant = {
  userId: string;
  role: string;
  displayName: string;
  avatarUrl: string | null;
};

export type VoiceRoomDetail = {
  id: string;
  title: string;
  status: string;
  isCreator: boolean;
  isStaff: boolean;
  canSpeak: boolean;
  myRole: string | null;
  isParticipant: boolean;
  currentSpeakerId: string | null;
  currentSpeakerName: string | null;
  floorFree: boolean;
  queuePosition: number | null;
  isMyTurnNext: boolean;
  participants: VoiceRoomParticipant[];
};

export type VoiceRoomAction =
  | "join"
  | "leave"
  | "request-speak"
  | "cancel-request"
  | "start-speaking"
  | "stop-speaking"
  | "force-stop"
  | "end-room";

export type LiveKitToken = { token: string; url: string };

export type BusinessSummary = {
  slug: string;
  name: string;
  logoUrl: string | null;
  category: string;
  status: string;
  isVerified: boolean;
};

export type BusinessesResponse = { mine: BusinessSummary[]; discover: BusinessSummary[] };

export type BusinessDetail = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  logoUrl: string | null;
  coverUrl: string | null;
  category: string;
  isVerified: boolean;
  averageRating: number;
  reviewCount: number;
  location: { label: string; address: string } | null;
  website: string | null;
};

export type MarketplaceCategory = "course" | "digital_product" | "freelance_service" | "theme" | "template" | "app";

export type MarketplaceItem = {
  category: MarketplaceCategory;
  categoryLabel: string;
  id: string;
  href: string;
  title: string;
  subtitle: string;
  priceLabel: string;
};

export type MarketplaceResponse = { items: MarketplaceItem[] };

export type EventSummary = {
  slug: string;
  title: string;
  coverImageUrl: string | null;
  format: string;
  location: string | null;
  startsAt: string;
  hostLabel: string;
};

export type EventsResponse = { items: EventSummary[] };

// Mobile pro-upgrade addendum, sub-phase M13 (widened Explore search).
// Lighter than EventSummary — GET /api/v1/search?type=events only selects
// title+date (see that route's own comment for why), not the full host/
// cover fields the events list screen shows.
export type EventSearchResult = { slug: string; title: string; startsAt: string };

export type CommunitySearchResponse = { items: CommunitySummary[] };
export type BusinessSearchResponse = { items: BusinessSummary[] };
export type EventSearchResponse = { items: EventSearchResult[] };

export type EventRsvpStatus = "going" | "interested" | "not_going";

export type TicketTypeSummary = {
  id: string;
  name: string;
  price: number | null;
  currency: string | null;
  quantityTotal: number | null;
  quantitySold: number;
};

export type EventDetail = {
  slug: string;
  title: string;
  description: string;
  coverImageUrl: string | null;
  format: string;
  location: string | null;
  virtualJoinUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  capacity: number | null;
  hostLabel: string;
  myRsvpStatus: EventRsvpStatus | null;
  goingCount: number;
  interestedCount: number;
  ticketTypes: TicketTypeSummary[];
};

export type WalletTransferEntry = {
  id: string;
  direction: "sent" | "received";
  amount: number;
  counterpartyUsername: string | null;
  counterpartyDisplayName: string | null;
  createdAt: string;
};

export type WalletResponse = { coinBalance: number; history: WalletTransferEntry[] };

// M12 (settings/account parity) — mirror the corresponding
// /api/v1/{privacy,blocks,account/*,preferences}* routes' response shapes.

export type PrivacySettings = { allowDmsFrom: string; allowTagging: boolean; discoverableInSearch: boolean };

export type BlockedUser = {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  blockedAt: string;
};

export type BlockedUsersResponse = { items: BlockedUser[]; nextCursor: string | null };

export type SessionInfo = { id: string; userAgent: string | null; ipAddress: string | null; lastSeenAt: string; createdAt: string };

export type LoginEvent = {
  id: string;
  createdAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  method: string;
};

export type SessionsResponse = { sessions: SessionInfo[]; loginEvents: LoginEvent[] };

export type TwoFactorStatus = { enabled: boolean };
export type TwoFactorEnrollment = { otpauthUrl: string; qrDataUrl: string };
export type RecoveryCodes = { recoveryCodes: string[] };

export type AccessibilityPrefs = { reducedMotion: boolean; fontScale: string; highContrast: boolean };
export type PreferencesResponse = { locale: string | null; timezone: string | null; accessibilityPrefs: AccessibilityPrefs };
