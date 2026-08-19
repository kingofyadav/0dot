import * as SecureStore from "expo-secure-store";

// expo-secure-store, not AsyncStorage — same "bearer-equivalent credential
// stays out of plain storage" posture as this codebase's accessTokenHash/
// encryptAtRest handling on the server side.
const ACCESS_TOKEN_KEY = "0dot_access_token";
const REFRESH_TOKEN_KEY = "0dot_refresh_token";
const EXPIRES_AT_KEY = "0dot_token_expires_at";

export type StoredTokens = { accessToken: string; refreshToken: string; expiresAt: number };

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
    SecureStore.setItemAsync(EXPIRES_AT_KEY, String(tokens.expiresAt)),
  ]);
}

export async function loadTokens(): Promise<StoredTokens | null> {
  const [accessToken, refreshToken, expiresAtRaw] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.getItemAsync(EXPIRES_AT_KEY),
  ]);
  // Explicit null checks, not truthiness — SecureStore.getItemAsync returns
  // null for "not set", but a falsy-string check would also (wrongly) treat
  // a stored empty string as "missing" and silently discard an otherwise
  // valid session.
  if (accessToken == null || refreshToken == null || expiresAtRaw == null) return null;
  return { accessToken, refreshToken, expiresAt: Number(expiresAtRaw) };
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(EXPIRES_AT_KEY),
  ]);
}
