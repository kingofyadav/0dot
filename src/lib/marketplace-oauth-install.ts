import "server-only";

// Shared between /m/[id]/install (issues the cookie) and
// /m/install-callback (reads and clears it) — see the former's comment for
// why a cookie, not a DB row, carries the PKCE verifier across the
// /oauth/authorize redirect.
export const INSTALL_PKCE_COOKIE = "0dot_install_pkce";
