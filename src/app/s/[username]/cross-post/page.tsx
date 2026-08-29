import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { X } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { disconnectExternalAccount, cancelScheduledCrossPost } from "@/app/actions/cross-post";
import { getSocialPlatformLabel } from "@/lib/theme-presets";
import { SocialIcon } from "@/components/SocialIcon";
import { ConfirmButton } from "@/components/ConfirmButton";
import { EmptyState } from "@/components/EmptyState";
import { SettingsRow } from "@/components/SettingsRow";
import { ConnectExternalAccountForm } from "../ConnectExternalAccountForm";
import { ComposeCrossPostForm } from "../ComposeCrossPostForm";
import type { CrossPostPlatform } from "@/lib/cross-post-platforms";

export const metadata: Metadata = { title: "Auto-post" };

const TARGET_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  publishing: "Publishing…",
  published: "Published",
  failed: "Failed",
};

export default async function CrossPostSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const profileRow = await db.profile.findUnique({
    where: { userId: currentUser.id },
    include: {
      externalSocialAccounts: { orderBy: { connectedAt: "asc" } },
      scheduledCrossPosts: {
        orderBy: { scheduledFor: "desc" },
        include: { targets: { include: { externalAccount: true } } },
      },
    },
  });
  if (!profileRow) redirect("/claim-username");

  // Revoked accounts (see disconnectExternalAccount) drop out of the active
  // list and the compose form's targets, but stay in the DB so already-sent
  // posts under "Scheduled & sent" keep their history and links.
  const connectedAccounts = profileRow.externalSocialAccounts.filter((a) => a.status === "connected");

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Auto-post</h2>
      <p className="mutedText">
        Connect your external accounts, then schedule a post to go out once, across whichever platforms you pick.
      </p>

      <p className="settingsGroupLabel">Connected accounts</p>
      {connectedAccounts.length === 0 ? (
        <EmptyState message="No accounts connected yet." />
      ) : (
        <div className="settingsGroup">
          {connectedAccounts.map((account) => (
            <SettingsRow
              key={account.id}
              label={
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                  <SocialIcon platform={account.platform as CrossPostPlatform} />
                  {getSocialPlatformLabel(account.platform)} — {account.displayName}
                </span>
              }
              trailing={
                <form action={disconnectExternalAccount}>
                  <input type="hidden" name="accountId" value={account.id} />
                  <ConfirmButton
                    className="button buttonSecondary iconButton"
                    aria-label={`Disconnect ${account.displayName}`}
                    title="Disconnect this account?"
                    description={`Any posts still scheduled to ${getSocialPlatformLabel(account.platform)} for this account will stop trying to publish. Already-sent posts and their history stay visible. You can reconnect anytime.`}
                    confirmLabel="Disconnect"
                  >
                    <X size={16} aria-hidden="true" />
                  </ConfirmButton>
                </form>
              }
            />
          ))}
        </div>
      )}
      <div className="settingsGroup" style={{ marginTop: "var(--space-3)", marginBottom: "var(--space-6)" }}>
        <div className="settingsAddPanelBody">
          <ConnectExternalAccountForm />
        </div>
      </div>

      <p className="settingsGroupLabel">Schedule a post</p>
      <div className="settingsGroup" style={{ marginBottom: "var(--space-6)" }}>
        <div className="settingsAddPanelBody">
          <ComposeCrossPostForm
            accounts={connectedAccounts.map((a) => ({
              id: a.id,
              platform: a.platform,
              displayName: a.displayName,
            }))}
          />
        </div>
      </div>

      <p className="settingsGroupLabel">Scheduled &amp; sent</p>
      {profileRow.scheduledCrossPosts.length === 0 ? (
        <EmptyState message="Nothing scheduled yet." />
      ) : (
        profileRow.scheduledCrossPosts.map((post) => (
          <div key={post.id} className="settingsGroup" style={{ marginBottom: "var(--space-3)" }}>
            <SettingsRow
              label={post.content || "(media only)"}
              description={`${post.scheduledFor.toLocaleString()} · ${post.status}`}
              trailing={
                post.status === "scheduled" ? (
                  <form action={cancelScheduledCrossPost}>
                    <input type="hidden" name="postId" value={post.id} />
                    <ConfirmButton
                      className="button buttonSecondary iconButton"
                      aria-label="Cancel scheduled post"
                      title="Cancel this scheduled post?"
                      description="It will not be published to any platform."
                      confirmLabel="Cancel post"
                    >
                      <X size={16} aria-hidden="true" />
                    </ConfirmButton>
                  </form>
                ) : undefined
              }
            />
            <div className="mutedText settingsAddPanelBody" style={{ fontSize: "0.85rem", paddingTop: 0, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {post.targets.map((target) => (
                <span key={target.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <SocialIcon platform={target.externalAccount.platform as CrossPostPlatform} />
                  {getSocialPlatformLabel(target.externalAccount.platform)}: {TARGET_STATUS_LABEL[target.status] ?? target.status}
                  {target.status === "published" && target.externalPostUrl && (
                    <a href={target.externalPostUrl} target="_blank" rel="noopener noreferrer nofollow">
                      view
                    </a>
                  )}
                  {target.status === "failed" && target.errorMessage && <span>({target.errorMessage})</span>}
                </span>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
