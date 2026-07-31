import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isCommunityStaff } from "@/lib/communities";
import { getMemberGrowth, getPostVolume, getActiveMemberCount, getTopPosts } from "@/lib/community-analytics";

const WINDOW_DAYS = 30;

// Staff-only (spec §14: owner/moderator-facing). Plain stat cards/tables
// for this pass, not charts — no charting library exists in this project
// yet; that's a separate call to make with the dataviz skill if real
// charts are wanted, not a default assumed here.
export default async function CommunityAnalyticsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const community = await db.community.findUnique({ where: { slug }, select: { id: true, slug: true, name: true } });
  if (!community) notFound();

  if (!(await isCommunityStaff(community.id, currentUser.id))) {
    redirect(`/c/${community.slug}`);
  }

  const [growth, volume, active7d, active30d, topPosts] = await Promise.all([
    getMemberGrowth(community.id, WINDOW_DAYS),
    getPostVolume(community.id, WINDOW_DAYS),
    getActiveMemberCount(community.id, 7),
    getActiveMemberCount(community.id, 30),
    getTopPosts(community.id, 10),
  ]);

  const totalJoins = growth.reduce((sum, d) => sum + d.joins, 0);
  const totalLeaves = growth.reduce((sum, d) => sum + d.leaves, 0);
  const totalPosts = volume.reduce((sum, d) => sum + d.posts, 0);
  const totalComments = volume.reduce((sum, d) => sum + d.comments, 0);

  const recentDays = growth.slice(-14); // last 14 of the 30-day window, table stays scannable

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{community.name} analytics</h1>
        <Link href={`/c/${community.slug}/manage`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Back to manage
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
        {[
          { label: "Joins (30d)", value: totalJoins },
          { label: "Leaves (30d)", value: totalLeaves },
          { label: "Posts (30d)", value: totalPosts },
          { label: "Comments (30d)", value: totalComments },
          { label: "Active (7d)", value: active7d },
          { label: "Active (30d)", value: active30d },
        ].map((stat) => (
          <div key={stat.label} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.2rem" }}>
            <span className="mutedText" style={{ fontSize: "0.75rem" }}>
              {stat.label}
            </span>
            <span style={{ fontSize: "1.3rem", fontWeight: 700 }}>{stat.value}</span>
          </div>
        ))}
      </div>

      <p className="sectionHeading">Daily activity (last 14 days)</p>
      <div style={{ overflowX: "auto", marginBottom: "1.5rem" }}>
        <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "0.4rem" }}>Date</th>
              <th style={{ padding: "0.4rem" }}>Joins</th>
              <th style={{ padding: "0.4rem" }}>Leaves</th>
              <th style={{ padding: "0.4rem" }}>Posts</th>
              <th style={{ padding: "0.4rem" }}>Comments</th>
            </tr>
          </thead>
          <tbody>
            {recentDays.map((day) => {
              const volumeDay = volume.find((v) => v.date === day.date);
              return (
                <tr key={day.date} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.4rem" }}>{day.date}</td>
                  <td style={{ padding: "0.4rem" }}>{day.joins}</td>
                  <td style={{ padding: "0.4rem" }}>{day.leaves}</td>
                  <td style={{ padding: "0.4rem" }}>{volumeDay?.posts ?? 0}</td>
                  <td style={{ padding: "0.4rem" }}>{volumeDay?.comments ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="sectionHeading">Top posts</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {topPosts.length === 0 && <p className="mutedText">No posts yet.</p>}
        {topPosts.map((post) => {
          const authorName = post.author.profile?.displayName ?? post.author.username?.handle ?? "Unknown";
          const engagement = post.likeCount + post.replyCount + post.repostCount;
          return (
            <div key={post.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.3rem" }}>
              <span className="mutedText" style={{ fontSize: "0.8rem" }}>
                {authorName} · {engagement} engagement
              </span>
              <p style={{ margin: 0 }}>{post.body.slice(0, 140)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
