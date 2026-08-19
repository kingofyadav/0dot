import { API_BASE_URL } from "../config";
import { loadTokens } from "../auth/tokenStorage";
import { fetchWithTimeout, isAbortError } from "./http";
import type { Me, Profile, Post } from "./types";
import type { NativePlatform } from "../config";

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

async function authorizedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const tokens = await loadTokens();
  if (!tokens) throw new ApiError("Not signed in.", 401);

  let res: Response;
  try {
    res = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${tokens.accessToken}`, "Content-Type": "application/json" },
    });
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

// Build plan step 5, against step 2's /api/v1/device-tokens route.
export function registerDeviceToken(args: { platform: NativePlatform; token: string }): Promise<{ ok: true }> {
  return authorizedRequest<{ ok: true }>("/api/v1/device-tokens", { method: "POST", body: JSON.stringify(args) });
}

export function unregisterDeviceToken(token: string): Promise<{ ok: true }> {
  return authorizedRequest<{ ok: true }>("/api/v1/device-tokens", { method: "DELETE", body: JSON.stringify({ token }) });
}
