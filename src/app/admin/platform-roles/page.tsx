import { requirePlatformRole } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { PLATFORM_ROLE_RANK } from "@/lib/platform-roles";
import { updatePlatformRole, revokePlatformRole } from "@/app/actions/platform-roles";
import { GrantRoleForm } from "./GrantRoleForm";

// super_admin-only. Lists/manages PlatformRole rows — the in-app
// replacement for granting platform access via direct DB access. Mirrors
// /org/[orgId]/manage's member-management form pattern.
export default async function AdminPlatformRolesPage() {
  const { user } = await requirePlatformRole("super_admin");

  const roles = (
    await db.platformRole.findMany({
      include: { user: { include: { username: true } } },
      orderBy: { grantedAt: "asc" },
    })
  ).sort((a, b) => PLATFORM_ROLE_RANK[b.role] - PLATFORM_ROLE_RANK[a.role]);

  return (
    <div className="profileCard">
      <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.25rem" }}>Platform roles</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1.5rem" }}>
        {roles.map((r) => (
          <div key={r.userId} className="profileLinkItem" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
            <span>
              {r.user.username?.handle ? `@${r.user.username.handle}` : r.user.email}
              <span className="mutedText"> · {r.role}</span>
            </span>
            {r.userId !== user.id && (
              <span style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                <form action={updatePlatformRole} style={{ display: "flex", gap: "0.3rem" }}>
                  <input type="hidden" name="userId" value={r.userId} />
                  <select name="role" defaultValue={r.role} className="textInput" style={{ fontSize: "0.8rem" }}>
                    <option value="support">Support</option>
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super admin</option>
                  </select>
                  <button type="submit" className="button buttonSecondary buttonSmall">
                    Update
                  </button>
                </form>
                <form action={revokePlatformRole}>
                  <input type="hidden" name="userId" value={r.userId} />
                  <button type="submit" className="button buttonDanger buttonSmall">
                    Revoke
                  </button>
                </form>
              </span>
            )}
          </div>
        ))}
      </div>

      <GrantRoleForm />
    </div>
  );
}
