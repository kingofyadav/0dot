import Link from "next/link";
import {
  addGroupParticipants,
  removeGroupParticipant,
  renameGroupConversation,
  leaveConversation,
} from "@/app/actions/messages";

type Participant = {
  userId: string;
  role: string;
  displayName: string;
  handle: string | null;
};

type Candidate = { userId: string; handle: string | null; displayName: string };

// Server-rendered forms only — no client JS needed (checkboxes with a
// shared `name` work as plain progressive-enhancement forms), same posture
// as UserListItem's follow toggle. Rendered only for kind==="group" — see
// [conversationId]/page.tsx.
export function GroupParticipantsPanel({
  conversationId,
  participants,
  addCandidates,
  isViewerAdmin,
  viewerUserId,
}: {
  conversationId: string;
  participants: Participant[];
  addCandidates: Candidate[];
  isViewerAdmin: boolean;
  viewerUserId: string;
}) {
  return (
    <details className="profileEditToggle" style={{ marginBottom: "0.75rem" }}>
      <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
        Group info ({participants.length})
      </summary>
      <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {isViewerAdmin && (
          <form action={renameGroupConversation} style={{ display: "flex", gap: "0.5rem" }}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <input type="text" name="title" className="textInput" placeholder="Rename group" maxLength={100} />
            <button type="submit" className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
              Rename
            </button>
          </form>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {participants.map((p) => (
            <div key={p.userId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
              <span>
                {p.handle ? <Link href={`/${p.handle}`}>{p.displayName}</Link> : p.displayName}
                {p.role === "admin" && <span className="mutedText"> · admin</span>}
              </span>
              {isViewerAdmin && p.userId !== viewerUserId && (
                <form action={removeGroupParticipant}>
                  <input type="hidden" name="conversationId" value={conversationId} />
                  <input type="hidden" name="userId" value={p.userId} />
                  <button
                    type="submit"
                    className="button buttonSecondary"
                    style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}
                  >
                    Remove
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>

        {addCandidates.length > 0 && (
          <form action={addGroupParticipants} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <p className="mutedText" style={{ margin: 0, fontSize: "0.85rem" }}>Add people</p>
            {addCandidates.map((c) => (
              <label key={c.userId} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <input type="checkbox" name="participantIds" value={c.userId} />
                {c.displayName}
              </label>
            ))}
            <button
              type="submit"
              className="button buttonSecondary"
              style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem", alignSelf: "flex-start" }}
            >
              Add selected
            </button>
          </form>
        )}

        <form action={leaveConversation}>
          <input type="hidden" name="conversationId" value={conversationId} />
          <button type="submit" className="button buttonDanger" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
            Leave group
          </button>
        </form>
      </div>
    </details>
  );
}
