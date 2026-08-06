import { vi, beforeEach } from "vitest";
import { cookieJar, headerJar, redirectState, resetNextTestState, NextRedirectSignal } from "./next-test-state";

// Minimal stand-ins for the subset of next/headers, next/navigation, and
// next/cache each tested module actually calls — real Next.js request APIs
// throw outside a request context, so anything importing them (session.ts,
// rate-limit.ts, auth-guards.ts, and every Server Action built on top)
// needs these mocked to run under vitest at all.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
  headers: async () => ({
    get: (name: string) => headerJar.get(name.toLowerCase()) ?? null,
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    redirectState.url = url;
    throw new NextRedirectSignal(url);
  },
  permanentRedirect: (url: string) => {
    redirectState.url = url;
    throw new NextRedirectSignal(url);
  },
  notFound: () => {
    throw new NextRedirectSignal("__notFound__");
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

beforeEach(() => {
  resetNextTestState();
});
