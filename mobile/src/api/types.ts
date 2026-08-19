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
  likeCount: number;
  replyCount: number;
  repostCount: number;
  createdAt: string;
};
