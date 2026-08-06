// Shared, resettable state backing the next/headers, next/navigation, and
// next/cache mocks registered in src/test/setup.ts. Tests import this
// module directly to seed cookies/headers or to inspect where a Server
// Action tried to redirect, since none of that is observable through the
// real Next.js APIs outside an actual request.

export const cookieJar = new Map<string, string>();
export const headerJar = new Map<string, string>();

export const redirectState: { url: string | null } = { url: null };

export class NextRedirectSignal extends Error {
  constructor(public readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

export function resetNextTestState() {
  cookieJar.clear();
  headerJar.clear();
  redirectState.url = null;
}

// Convenience for tests that need to run a Server Action past a login gate.
export function setSessionCookie(token: string) {
  cookieJar.set("0dot_session", token);
}
