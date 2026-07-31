import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getCommunityMember, isCommunityStaff } from "@/lib/communities";
import {
  approveJoinRequest,
  declineJoinRequest,
  appointModerator,
  removeModerator,
  muteMember,
  unmuteMember,
  banMember,
  unbanMember,
  transferOwnership,
  deleteCommunity,
} from "@/app/actions/communities";
import { addRule, updateRule, deleteRule, moveRule } from "@/app/actions/community-rules";
import { setCommunityTags, createPostFlair, deletePostFlair } from "@/app/actions/community-tags";
import { COMMUNITY_TAGS, MAX_TAGS_PER_COMMUNITY } from "@/lib/community-tags";
import { FLAIR_COLORS, flairColorStyle, MAX_FLAIRS_PER_COMMUNITY } from "@/lib/flair-colors";
import { Logo } from "@/components/Logo";
import { ManageCommunityForm } from "./ManageCommunityForm";

const MOD_ACTION_LABELS: Record<string, string> = {
  remove_post: "removed a post",
  remove_comment: "removed a comment",
  remove_chat_message: "removed a chat message",
  mute_member: "muted",
  unmute_member: "unmuted",
  ban_member: "banned",
  unban_member: "unbanned",
  pin_post: "pinned a post",
  edit_rule: "edited a rule",
  edit_wiki: "edited the wiki",
  appoint_moderator: "made moderator",
  remove_moderator: "removed as moderator",
  transfer_ownership: "transferred ownership to",
};

function relativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function ManageCommunityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const community = await db.community.findUnique({ where: { slug } });
  if (!community) notFound();

  // Staff (owner or moderator) — a plain member (including a logged-in one)
  // gets sent back to the public view rather than a 404, same "wrong place,
  // not secret" posture as /s/[username]'s mismatched-handle redirect.
  if (!(await isCommunityStaff(community.id, currentUser.id))) {
    redirect(`/c/${community.slug}`);
  }
  const viewerMembership = await getCommunityMember(community.id, currentUser.id);
  const isOwner = viewerMembership?.role === "owner";

  const pendingMembers = await db.communityMember.findMany({
    where: { communityId: community.id, status: "pending" },
    orderBy: { joinedAt: "asc" },
    include: { user: { include: { username: true, profile: true } } },
  });

  // Everyone except the owner, split into active-ish (member/moderator,
  // active/muted) vs. banned — the owner never appears here since they have
  // no self-targeting moderation actions (see communities.ts).
  const nonOwnerMembers = await db.communityMember.findMany({
    where: { communityId: community.id, role: { not: "owner" }, status: { not: "pending" } },
    orderBy: { joinedAt: "asc" },
    include: { user: { include: { username: true, profile: true } } },
  });
  const activeMembers = nonOwnerMembers.filter((m) => m.status !== "banned");
  const bannedMembers = nonOwnerMembers.filter((m) => m.status === "banned");
  // Transfer target must be a fully active member/moderator — a muted
  // member shouldn't become owner without being unmuted first.
  const transferCandidates = activeMembers.filter((m) => m.status === "active");

  function memberName(m: (typeof nonOwnerMembers)[number]) {
    return m.user.profile?.displayName ?? m.user.username?.handle ?? "Unknown";
  }

  // phase-3 spec §13: modlog, staff-only for now (member-visibility is an
  // explicit open product question, §18 — defaulting to the conservative
  // reading rather than resolving it here). Most recent first, capped
  // rather than paginated — a lightweight audit trail, not a full log
  // viewer.
  const recentModActions = await db.modAction.findMany({
    where: { communityId: community.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { moderator: { include: { username: true, profile: true } } },
  });
  const rules = await db.communityRule.findMany({ where: { communityId: community.id }, orderBy: { position: "asc" } });
  const [selectedTags, flairs] = await Promise.all([
    db.communityTag.findMany({ where: { communityId: community.id } }),
    db.communityPostFlair.findMany({ where: { communityId: community.id } }),
  ]);
  const selectedTagKeys = new Set(selectedTags.map((t) => t.tag));

  const userTargetIds = [...new Set(recentModActions.filter((a) => a.targetType === "user").map((a) => a.targetId))];
  const targetUsers = userTargetIds.length
    ? await db.user.findMany({ where: { id: { in: userTargetIds } }, include: { username: true, profile: true } })
    : [];
  const targetUserNameById = new Map(
    targetUsers.map((u) => [u.id, u.profile?.displayName ?? u.username?.handle ?? "Unknown"])
  );

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Manage {community.name}</h1>
        <span style={{ display: "flex", gap: "0.5rem" }}>
          <Link href={`/c/${community.slug}/analytics`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
            Analytics
          </Link>
          <Link href={`/c/${community.slug}`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
            View community
          </Link>
        </span>
      </div>

      {pendingMembers.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p className="sectionHeading">Join requests</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {pendingMembers.map((pm) => (
              <div key={pm.userId} className="profileLinkItem" style={{ justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {pm.user.profile?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
                    <img src={pm.user.profile.avatarUrl} alt="" width={32} height={32} style={{ borderRadius: "50%", objectFit: "cover" }} />
                  ) : (
                    <Logo size={32} />
                  )}
                  {memberName(pm)}
                </span>
                <span style={{ display: "flex", gap: "0.5rem" }}>
                  <form action={approveJoinRequest}>
                    <input type="hidden" name="communityId" value={community.id} />
                    <input type="hidden" name="userId" value={pm.userId} />
                    <button type="submit" className="button buttonSmall">
                      Approve
                    </button>
                  </form>
                  <form action={declineJoinRequest}>
                    <input type="hidden" name="communityId" value={community.id} />
                    <input type="hidden" name="userId" value={pm.userId} />
                    <button type="submit" className="button buttonSecondary buttonSmall">
                      Decline
                    </button>
                  </form>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeMembers.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p className="sectionHeading">Members</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {activeMembers.map((m) => (
              <div key={m.userId} className="profileLinkItem" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {m.user.profile?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
                    <img src={m.user.profile.avatarUrl} alt="" width={32} height={32} style={{ borderRadius: "50%", objectFit: "cover" }} />
                  ) : (
                    <Logo size={32} />
                  )}
                  {memberName(m)}
                  {m.role === "moderator" && (
                    <span className="mutedText" style={{ fontSize: "0.75rem" }}>
                      Moderator
                    </span>
                  )}
                  {m.status === "muted" && (
                    <span className="mutedText" style={{ fontSize: "0.75rem" }}>
                      Muted
                    </span>
                  )}
                </span>
                <span style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {isOwner && m.role === "member" && (
                    <form action={appointModerator}>
                      <input type="hidden" name="communityId" value={community.id} />
                      <input type="hidden" name="userId" value={m.userId} />
                      <button type="submit" className="button buttonSecondary buttonSmall">
                        Make moderator
                      </button>
                    </form>
                  )}
                  {isOwner && m.role === "moderator" && (
                    <form action={removeModerator}>
                      <input type="hidden" name="communityId" value={community.id} />
                      <input type="hidden" name="userId" value={m.userId} />
                      <button type="submit" className="button buttonSecondary buttonSmall">
                        Remove moderator
                      </button>
                    </form>
                  )}
                  {/* Mute/ban only ever target a plain member — never the
                      owner, never another moderator (privilege-escalation
                      guard mirrored server-side in communities.ts). */}
                  {m.role === "member" && (
                    <>
                      {m.status === "muted" ? (
                        <form action={unmuteMember}>
                          <input type="hidden" name="communityId" value={community.id} />
                          <input type="hidden" name="userId" value={m.userId} />
                          <button type="submit" className="button buttonSecondary buttonSmall">
                            Unmute
                          </button>
                        </form>
                      ) : (
                        <form action={muteMember}>
                          <input type="hidden" name="communityId" value={community.id} />
                          <input type="hidden" name="userId" value={m.userId} />
                          <button type="submit" className="button buttonSecondary buttonSmall">
                            Mute
                          </button>
                        </form>
                      )}
                      <form action={banMember}>
                        <input type="hidden" name="communityId" value={community.id} />
                        <input type="hidden" name="userId" value={m.userId} />
                        <button type="submit" className="button buttonDanger buttonSmall">
                          Ban
                        </button>
                      </form>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {bannedMembers.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p className="sectionHeading">Banned members</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {bannedMembers.map((m) => (
              <div key={m.userId} className="profileLinkItem" style={{ justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {m.user.profile?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
                    <img src={m.user.profile.avatarUrl} alt="" width={32} height={32} style={{ borderRadius: "50%", objectFit: "cover" }} />
                  ) : (
                    <Logo size={32} />
                  )}
                  {memberName(m)}
                </span>
                <form action={unbanMember}>
                  <input type="hidden" name="communityId" value={community.id} />
                  <input type="hidden" name="userId" value={m.userId} />
                  <button type="submit" className="button buttonSecondary buttonSmall">
                    Unban
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentModActions.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p className="sectionHeading">Recent activity</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {recentModActions.map((a) => {
              const moderatorName = a.moderator.profile?.displayName ?? a.moderator.username?.handle ?? "Unknown";
              const targetName = a.targetType === "user" ? targetUserNameById.get(a.targetId) : null;
              const label = MOD_ACTION_LABELS[a.action] ?? a.action;
              return (
                <p key={a.id} className="mutedText" style={{ fontSize: "0.85rem" }}>
                  <strong style={{ color: "var(--foreground)" }}>{moderatorName}</strong> {label}
                  {targetName ? ` ${targetName}` : ""} · {relativeTime(a.createdAt)}
                  {a.reason && ` — "${a.reason}"`}
                </p>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginBottom: "1.5rem" }}>
        <p className="sectionHeading">Rules</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {rules.map((rule, index) => (
            <details key={rule.id} className="profileEditToggle">
              <summary style={{ fontSize: "0.9rem" }}>
                {index + 1}. {rule.title}
              </summary>
              <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "40ch" }}>
                <form action={updateRule} style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <input type="hidden" name="communityId" value={community.id} />
                  <input type="hidden" name="ruleId" value={rule.id} />
                  <input type="text" name="title" defaultValue={rule.title} maxLength={80} required className="textInput" />
                  <textarea name="body" defaultValue={rule.body} maxLength={500} rows={2} className="textInput" />
                  <button type="submit" className="button buttonSmall">
                    Save
                  </button>
                </form>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <form action={moveRule}>
                    <input type="hidden" name="communityId" value={community.id} />
                    <input type="hidden" name="ruleId" value={rule.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button type="submit" className="button buttonSecondary buttonSmall" disabled={index === 0}>
                      Move up
                    </button>
                  </form>
                  <form action={moveRule}>
                    <input type="hidden" name="communityId" value={community.id} />
                    <input type="hidden" name="ruleId" value={rule.id} />
                    <input type="hidden" name="direction" value="down" />
                    <button type="submit" className="button buttonSecondary buttonSmall" disabled={index === rules.length - 1}>
                      Move down
                    </button>
                  </form>
                  <form action={deleteRule}>
                    <input type="hidden" name="communityId" value={community.id} />
                    <input type="hidden" name="ruleId" value={rule.id} />
                    <button type="submit" className="button buttonDanger buttonSmall">
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            </details>
          ))}
        </div>
        <details className="profileEditToggle" style={{ marginTop: "0.6rem" }}>
          <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
            Add a rule
          </summary>
          <form action={addRule} style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "40ch" }}>
            <input type="hidden" name="communityId" value={community.id} />
            <input type="text" name="title" placeholder="Rule title" maxLength={80} required className="textInput" />
            <textarea name="body" placeholder="Details (optional)" maxLength={500} rows={2} className="textInput" />
            <button type="submit" className="button buttonSmall" style={{ alignSelf: "flex-start" }}>
              Add rule
            </button>
          </form>
        </details>
      </div>

      {isOwner && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p className="sectionHeading">Discovery tags</p>
          <form action={setCommunityTags} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <input type="hidden" name="communityId" value={community.id} />
            <p className="mutedText" style={{ fontSize: "0.8rem", margin: 0 }}>
              Pick up to {MAX_TAGS_PER_COMMUNITY} — helps people find this community in search.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {COMMUNITY_TAGS.map((t) => (
                <label
                  key={t.key}
                  className="mutedText"
                  style={{
                    fontSize: "0.8rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    border: "1px solid var(--border)",
                    borderRadius: "999px",
                    padding: "0.2rem 0.6rem",
                  }}
                >
                  <input type="checkbox" name="tag" value={t.key} defaultChecked={selectedTagKeys.has(t.key)} />
                  {t.label}
                </label>
              ))}
            </div>
            <button type="submit" className="button buttonSmall" style={{ alignSelf: "flex-start" }}>
              Save tags
            </button>
          </form>
        </div>
      )}

      <div style={{ marginBottom: "1.5rem" }}>
        <p className="sectionHeading">Post flair</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {flairs.map((f) => {
            const style = flairColorStyle(f.color);
            return (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span
                  style={{ ...style, fontSize: "0.75rem", fontWeight: 600, padding: "0.1rem 0.5rem", borderRadius: "999px" }}
                >
                  {f.label}
                </span>
                <form action={deletePostFlair}>
                  <input type="hidden" name="communityId" value={community.id} />
                  <input type="hidden" name="flairId" value={f.id} />
                  <button type="submit" className="button buttonSecondary buttonSmall">
                    Delete
                  </button>
                </form>
              </div>
            );
          })}
        </div>
        {flairs.length < MAX_FLAIRS_PER_COMMUNITY && (
          <details className="profileEditToggle" style={{ marginTop: "0.6rem" }}>
            <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
              Add flair
            </summary>
            <form action={createPostFlair} style={{ marginTop: "0.6rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <input type="hidden" name="communityId" value={community.id} />
              <input type="text" name="label" placeholder="Label" maxLength={30} required className="textInput" style={{ width: "12rem" }} />
              <select name="color" required className="textInput" style={{ width: "8rem" }}>
                {FLAIR_COLORS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button type="submit" className="button buttonSmall">
                Add
              </button>
            </form>
          </details>
        )}
      </div>

      <p className="sectionHeading">Community details</p>
      <ManageCommunityForm
        communityId={community.id}
        name={community.name}
        description={community.description}
        visibility={community.visibility}
        avatarUrl={community.avatarUrl}
        coverUrl={community.coverUrl}
        wikiEditPolicy={community.wikiEditPolicy}
      />

      {isOwner && (
        <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border)" }}>
          <p className="sectionHeading">Danger zone</p>

          {transferCandidates.length > 0 && (
            <details className="profileEditToggle">
              <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
                Transfer ownership
              </summary>
              <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: "32ch" }}>
                <p className="mutedText" style={{ fontSize: "0.85rem" }}>
                  You&apos;ll become a moderator. The new owner is the only one
                  who can transfer it again.
                </p>
                <form action={transferOwnership} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <input type="hidden" name="communityId" value={community.id} />
                  <select name="userId" required>
                    {transferCandidates.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {memberName(m)}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="button buttonDanger buttonSmall">
                    Yes, transfer ownership
                  </button>
                </form>
              </div>
            </details>
          )}

          <details className="profileEditToggle" style={{ marginTop: "0.75rem" }}>
            <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
              Delete community
            </summary>
            <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: "32ch" }}>
              <p className="mutedText" style={{ fontSize: "0.85rem" }}>
                Permanently deletes {community.name} and removes all{" "}
                {community.memberCount} member{community.memberCount === 1 ? "" : "s"}. This cannot be undone.
              </p>
              <form action={deleteCommunity}>
                <input type="hidden" name="communityId" value={community.id} />
                <button type="submit" className="button buttonDanger buttonSmall">
                  Yes, delete {community.name}
                </button>
              </form>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
