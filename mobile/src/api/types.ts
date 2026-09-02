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

// GET /api/v1/live/[livestreamId] — ingestKey is deliberately never
// returned by that route (schema.prisma's own comment on that column).
export type LivestreamDetail = {
  id: string;
  title: string;
  status: string; // scheduled | live | ended
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  hasAccess: boolean;
  creator: { username: string | null; displayName: string | null; avatarUrl: string | null };
};

export type LivestreamChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  sender: { username: string | null; displayName: string | null; avatarUrl: string | null };
};

export type LivestreamChatResponse = { items: LivestreamChatMessage[]; nextCursor: string | null };

export type LiveKitToken = { token: string; url: string };

export type BusinessSummary = {
  id: string;
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

export type WalletBalance = { spendable: number; restricted: number; total: number };

export type WalletResponse = {
  coinBalance: number;
  // Spendable/restricted split (server always returns it — see
  // GET /api/v1/wallet). `coinBalance` above is kept for older clients but
  // equals `balance.total`.
  balance: WalletBalance;
  history: WalletTransferEntry[];
};

export type BusinessWalletResponse = {
  balance: WalletBalance;
  activity: WalletTransactionEntry[];
  nextCursor: string | null;
};

// GET /api/v1/wallet/transactions — the full ledger (grants, purchases,
// holds, admin adjustments, not just peer transfers). `kind` is the coarse
// ledger kind; `feature` resolves to the specific PaymentTransaction kind
// (tip/donation/course_purchase/...) when the ledger kind is a generic
// purchase/refund, else equals `kind` — see
// src/lib/wallet/ledger.ts::listLedgerEntries and
// src/lib/wallet/activity-labels.ts for the exact server-side mapping this
// mirrors.
export type WalletTransactionEntry = {
  id: string;
  transactionId: string;
  kind: string;
  feature: string;
  direction: "in" | "out";
  amountCoins: number;
  memo: string | null;
  createdAt: string;
};

export type WalletTransactionsResponse = { entries: WalletTransactionEntry[]; nextCursor: string | null };

export type WalletPurchaseTarget =
  | { target: "premium"; billingInterval: "monthly" | "yearly" }
  | { target: "tip"; username: string; amount: number; message?: string };

export type WalletPurchaseResponse = { ok: true; target: "premium" | "tip" };

export type ReferralInfo = {
  code: string;
  joinUrl: string;
  attributedSignups: number;
  rewardedInvites: number;
  maxRewardedInvites: number;
  rewardCoinsPerInvite: number;
};

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

// GET /api/v1/profiles/[username]/resume — a pure recomposition of Profile
// fields, no separate resume model server-side either.
export type WorkExperienceItem = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  startDate: string;
  endDate: string | null;
  description: string;
};

export type EducationItem = {
  id: string;
  institution: string;
  degree: string | null;
  fieldOfStudy: string | null;
  startDate: string;
  endDate: string | null;
  description: string;
};

export type ResumeResponse = {
  resumePdfUrl: string | null;
  workExperiences: WorkExperienceItem[];
  education: EducationItem[];
  skills: { id: string; name: string }[];
  featuredProjects: { id: string; slug: string; title: string; summary: string }[];
};

// GET /api/v1/profiles/[username]/articles(/[slug])
export type ArticleSummary = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  format: string;
  formatLabel: string;
  coverImageUrl: string | null;
  readingTimeMinutes: number;
  publishedAt: string | null;
};

export type ArticleDetail = ArticleSummary & {
  body: string;
  status: string;
  visibility: string;
  likeCount: number;
  commentCount: number;
  isOwner: boolean;
  hashtags: string[];
};

// GET /api/v1/profiles/[username]/wiki(/[slug])
export type WikiPageSummary = { id: string; slug: string; title: string; kind: string; kindLabel: string };

export type WikiPageDetail = WikiPageSummary & {
  visibility: string | null;
  body: string;
  isOwner: boolean;
  parent: { slug: string; title: string } | null;
  children: { id: string; slug: string; title: string }[];
};

// GET /api/v1/profiles/[username]/books(/[slug](/[chapterSlug]))
export type BookSummary = { id: string; slug: string; title: string; description: string; coverImageUrl: string | null };

export type BookChapterSummary = { id: string; slug: string; title: string };

export type BookDetail = BookSummary & {
  ebookFileUrl: string | null;
  status: string;
  visibility: string;
  likeCount: number;
  commentCount: number;
  isOwner: boolean;
  chapters: BookChapterSummary[];
};

export type BookChapterDetail = {
  id: string;
  slug: string;
  title: string;
  visibility: string | null;
  body: string;
  isOwner: boolean;
  parent: { slug: string; title: string } | null;
  children: BookChapterSummary[];
};

// GET /api/v1/profiles/[username]/courses(/[courseId])
export type CourseSummary = { id: string; title: string; description: string; price: number | null; currency: string | null };

// correctIndex is deliberately never included — see the route's own comment.
export type QuizQuestion = { question: string; options: string[] };

export type CourseQuiz = { id: string; passingScore: number; passed: boolean; questions: QuizQuestion[] };

export type CourseLesson = {
  id: string;
  title: string;
  contentType: string; // video | text | download
  isCompleted: boolean;
  hasFile: boolean;
  body: string | null;
  quizzes: CourseQuiz[];
};

export type CourseModuleDetail = { id: string; title: string; lessons: CourseLesson[] };

export type CourseDetail = CourseSummary & {
  requiredTier: { id: string; name: string } | null;
  status: string;
  isOwner: boolean;
  hasAccess: boolean;
  modules: CourseModuleDetail[];
};

export type QuizAttemptResult = { score: number; passed: boolean };
