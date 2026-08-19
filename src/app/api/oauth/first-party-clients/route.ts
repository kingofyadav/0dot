import { getFirstPartyClientIds } from "@/lib/first-party-apps";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// phase-15 build plan step 3: the one piece of information a first-party
// mobile/desktop build needs before it can even start the PKCE flow — which
// client_id (per platform) it is. Unauthenticated by design: client_id is
// public information in every OAuth flow (it rides in the browser-visible
// authorization redirect), unlike client_secret, which this route never
// returns. Still rate-limited per IP, same posture as every other
// unauthenticated, DB-touching route in this codebase (e.g. the oauth
// token endpoint) — being safe to expose isn't the same as being safe to
// hammer.
export async function GET() {
  const ip = await getClientIp();
  if (!checkRateLimit(`first-party-clients:ip:${ip}`, { max: 30, windowMs: 60 * 1000 })) {
    return Response.json({ error: "Rate limit exceeded." }, { status: 429 });
  }
  return Response.json(await getFirstPartyClientIds());
}
