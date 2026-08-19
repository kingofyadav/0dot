const DEFAULT_TIMEOUT_MS = 15000;

// React Native's fetch has no built-in timeout — a captive portal or a
// dropped connection would otherwise hang the calling await forever, which
// is exactly what left App.tsx's cold-start effect capable of getting stuck
// on its loading spinner permanently (see biometricLock/loadMe callers).
export async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}
