import { NextResponse } from "next/server";

// phase-15 spec §5.3: every public URL namespace built since Phase 1
// (@username, /c/, /b/, /p/, /e/, and the rest) resolves via iOS Universal
// Links into the installed app — this is the standard domain-association
// file Apple's OS fetches over HTTPS (no extension, must be exact path,
// application/json content-type) to establish that trust. TEAMID must be
// replaced with 0dot's real Apple Developer Team ID at deploy time — a
// placeholder here since no App Store Connect account exists yet to draw
// a real one from.
const TEAM_ID = "TEAMID";
const BUNDLE_ID = "in.0dot.ios";

export function GET() {
  return NextResponse.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            appID: `${TEAM_ID}.${BUNDLE_ID}`,
            paths: [
              "/*",
              // Control/auth surfaces stay in the mobile browser rather than
              // deep-linking into the app — same routes a login/logout/OAuth
              // flow needs to complete in a real browser context.
              "NOT /login",
              "NOT /signup",
              "NOT /oauth/*",
              "NOT /admin/*",
              "NOT /api/*",
            ],
          },
        ],
      },
    },
    { headers: { "Content-Type": "application/json" } }
  );
}
