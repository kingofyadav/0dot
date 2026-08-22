// Shared between src/app/actions/platform-roles.ts (a "use server" module,
// can't be imported by the standalone bootstrap script since it pulls in
// next/cache) and scripts/grant-super-admin.ts — kept here, dependency-free,
// so both stay in sync on the valid role set.
export const ROLE_VALUES = new Set(["support", "admin", "super_admin"]);

// support < admin < super_admin. Used both for auth-guards.ts's rank check
// and for sorting /admin/platform-roles by authority rather than alphabetically
// (plain alphabetical desc on the string column puts "support" above
// "super_admin" above "admin", which isn't the intended ordering).
export const PLATFORM_ROLE_RANK: Record<string, number> = { support: 1, admin: 2, super_admin: 3 };
