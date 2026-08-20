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
  followerCount: number;
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
