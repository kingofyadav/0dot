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
  actor: { username: string | null; displayName: string | null; avatarUrl: string | null } | null;
  isRead: boolean;
  createdAt: string;
};

export type NotificationsResponse = {
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

// Mobile pro-upgrade addendum, sub-phase M3 — mirrors the /api/v1/conversations*
// routes' response shapes exactly (see those routes on the server).
export type ConversationSummary = {
  id: string;
  kind: string;
  title: string;
  handle: string | null;
  avatarUrl: string | null;
  otherUserId: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  isUnread: boolean;
  isRequest: boolean;
};

export type ConversationsResponse = { items: ConversationSummary[]; nextCursor: string | null };

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
