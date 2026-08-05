import { requireVerifiedUser } from "@/lib/auth-guards";
import { getAdminOrganizations } from "@/lib/organizations";
import { NewCommunityForm } from "./NewCommunityForm";

export default async function NewCommunityPage() {
  const user = await requireVerifiedUser();
  const organizations = await getAdminOrganizations(user.id);

  return (
    <div className="profileCard">
      <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.25rem" }}>Create a community</h1>
      <p className="mutedText" style={{ marginBottom: "1.25rem" }}>
        A shared space others can join around a topic or purpose.
      </p>

      <NewCommunityForm organizations={organizations} />
    </div>
  );
}
