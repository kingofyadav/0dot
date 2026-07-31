import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getMessageableCandidates } from "@/lib/messaging";
import { GroupComposeForm } from "./GroupComposeForm";

export default async function NewGroupPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const candidates = await getMessageableCandidates(currentUser.id);

  return (
    <div className="profileCard">
      <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1rem" }}>New group</h1>
      <GroupComposeForm candidates={candidates} />
    </div>
  );
}
