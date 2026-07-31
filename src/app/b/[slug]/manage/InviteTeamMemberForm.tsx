"use client";

import { useActionState } from "react";
import { inviteTeamMember } from "@/app/actions/businesses";

export function InviteTeamMemberForm({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState(inviteTeamMember, undefined);

  return (
    <form action={formAction} style={{ marginTop: "0.6rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="text" name="username" placeholder="@username" required className="textInput" style={{ width: "12rem" }} />
      <select name="role" defaultValue="member" className="textInput" style={{ width: "9rem" }}>
        <option value="member">Member</option>
        <option value="editor">Editor</option>
        <option value="admin">Admin</option>
      </select>
      <button type="submit" className="button buttonSmall" disabled={pending}>
        {pending ? "Adding…" : "Add to team"}
      </button>
      {state?.error && <p className="errorText" style={{ width: "100%", margin: 0 }}>{state.error}</p>}
    </form>
  );
}
