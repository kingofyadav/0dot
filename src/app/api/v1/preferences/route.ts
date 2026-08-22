import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { LOCALES, TIMEZONES, FONT_SCALES, type AccessibilityPrefs } from "@/lib/preferences";

function parseAccessibilityPrefs(json: string | null): AccessibilityPrefs {
  if (!json) return { reducedMotion: false, fontScale: "default", highContrast: false };
  try {
    return { reducedMotion: false, fontScale: "default", highContrast: false, ...JSON.parse(json) };
  } catch {
    return { reducedMotion: false, fontScale: "default", highContrast: false };
  }
}

// Bearer-token counterpart to preferences/page.tsx + updatePreferences
// (src/app/actions/preferences.ts). reducedMotion is returned (mobile
// merges it with the OS-level signal it already reads everywhere — see
// this addendum's own finding on not duplicating that control) but isn't
// accepted as writable here: the mobile client has no UI for it, so a
// write route accepting it would be dead surface no screen ever calls.
export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "preferences:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const user = await db.user.findUnique({
    where: { id: ctx.userId },
    select: { locale: true, timezone: true, accessibilityPrefsJson: true },
  });
  if (!user) return apiError("Not found.", 404);

  return Response.json(
    { locale: user.locale, timezone: user.timezone, accessibilityPrefs: parseAccessibilityPrefs(user.accessibilityPrefsJson) },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}

export async function PATCH(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "preferences:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const payload = await request.json().catch(() => null);
  if (!payload) return apiError("Invalid request body.", 400);

  if (payload.locale !== undefined && payload.locale !== null && !(LOCALES as readonly string[]).includes(payload.locale)) {
    return apiError("Choose a valid language.", 400);
  }
  if (payload.timezone !== undefined && payload.timezone !== null && !(TIMEZONES as readonly string[]).includes(payload.timezone)) {
    return apiError("Choose a valid timezone.", 400);
  }
  if (payload.fontScale !== undefined && !FONT_SCALES.has(payload.fontScale)) {
    return apiError("Choose a valid text size.", 400);
  }
  if (payload.highContrast !== undefined && typeof payload.highContrast !== "boolean") {
    return apiError("Invalid request body.", 400);
  }

  const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { accessibilityPrefsJson: true } });
  if (!user) return apiError("Not found.", 404);

  const currentPrefs = parseAccessibilityPrefs(user.accessibilityPrefsJson);
  const nextPrefs: AccessibilityPrefs = {
    ...currentPrefs,
    ...(payload.fontScale !== undefined ? { fontScale: payload.fontScale } : {}),
    ...(payload.highContrast !== undefined ? { highContrast: payload.highContrast } : {}),
  };

  const updated = await db.user.update({
    where: { id: ctx.userId },
    data: {
      ...(payload.locale !== undefined ? { locale: payload.locale } : {}),
      ...(payload.timezone !== undefined ? { timezone: payload.timezone } : {}),
      accessibilityPrefsJson: JSON.stringify(nextPrefs),
    },
    select: { locale: true, timezone: true, accessibilityPrefsJson: true },
  });

  return Response.json(
    { locale: updated.locale, timezone: updated.timezone, accessibilityPrefs: parseAccessibilityPrefs(updated.accessibilityPrefsJson) },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
