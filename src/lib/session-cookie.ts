// Just the cookie name, split out of session.ts so proxy.ts can check for
// the cookie's mere presence without importing session.ts itself — that
// pulls in @/lib/db (Prisma), which proxy.ts's own comment notes doesn't
// survive this project's edge-labeled Proxy execution context. Deliberately
// no `import "server-only"` and no `next/*` import, same discipline as
// proxy-routing.ts, so this stays safe to import from either side.
export const SESSION_COOKIE = "0dot_session";
