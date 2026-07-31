import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isBlockedEitherWay } from "@/lib/blocks";
import { getMessageableCandidates } from "@/lib/messaging";
import { NewMessageForm } from "./NewMessageForm";

// The profile page's "Message" button bypasses the picker below entirely
// via ?to=<userId> — the real entry point for messaging someone outside
// your follow graph (spec §5.2's message-request path), since the picker
// can only ever reach people already in that graph (see
// getMessageableCandidates for why).
export default async function NewMessagePage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const { to: presetRecipientId } = await searchParams;
  let presetRecipient: { userId: string; handle: string | null; displayName: string; avatarUrl: string | null } | null =
    null;
  if (presetRecipientId && presetRecipientId !== currentUser.id) {
    const blocked = await isBlockedEitherWay(currentUser.id, presetRecipientId);
    if (!blocked) {
      const target = await db.user.findUnique({
        where: { id: presetRecipientId },
        include: { username: true, profile: true },
      });
      if (target?.profile) {
        presetRecipient = {
          userId: target.id,
          handle: target.username?.handle ?? null,
          displayName: target.profile.displayName,
          avatarUrl: target.profile.avatarUrl,
        };
      }
    }
  }

  if (presetRecipient) {
    return (
      <div className="profileCard">
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1rem" }}>
          Message {presetRecipient.displayName}
        </h1>
        <NewMessageForm candidates={[]} presetRecipient={presetRecipient} />
      </div>
    );
  }

  const candidates = await getMessageableCandidates(currentUser.id);

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>New message</h1>
        <Link href="/messages/new/group" className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          New group
        </Link>
      </div>
      <NewMessageForm candidates={candidates} />
    </div>
  );
}
