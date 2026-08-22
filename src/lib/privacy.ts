// Plain data, not colocated in actions/profile.ts — a "use server" file may
// only export async functions (see lib/preferences.ts's identical note), so
// /api/v1/privacy (a plain route, not a server action) needs this outside
// that file to import it directly rather than get a broken server-action
// reference.
export const ALLOW_DMS_FROM_VALUES = new Set(["everyone", "followers", "none"]);
