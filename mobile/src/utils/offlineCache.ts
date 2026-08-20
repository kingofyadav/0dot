import AsyncStorage from "@react-native-async-storage/async-storage";

// Phase 15 spec §5.2: read-time caching only ("previously-viewed content
// available offline via standard mobile-framework local storage"),
// explicitly not write-time queueing — this module is the read half.
// Every cache write is keyed by a namespace ("feed", "notifications",
// `profile:${username}`) so different screens don't collide, and callers
// own the freshness policy (they only read the cache after a live fetch
// has already failed, never as a first choice over the network).
const PREFIX = "0dot:cache:";

export async function setCached<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify({ value, cachedAt: Date.now() }));
  } catch {
    // Best-effort — a failed cache write shouldn't surface to the user;
    // the screen already has the live data it just fetched.
  }
}

export async function getCached<T>(key: string): Promise<{ value: T; cachedAt: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as { value: T; cachedAt: number };
  } catch {
    return null;
  }
}
