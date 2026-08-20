// Mirrors each /api/v1/* route's Response.json() shape exactly (see
// src/app/api/v1/{users/me,profiles/[username],posts/[id]}/route.ts on the
// server) — no independent serialization guesses.

export type Me = {
  id: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
};

export type Profile = {
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  isVerified: boolean;
  followerCount: number;
};

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
