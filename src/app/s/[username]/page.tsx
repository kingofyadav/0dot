import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { EditProfileForm } from "./EditProfileForm";

// Settings index — Edit profile. Auth/own-handle checks live in
// layout.tsx now (shared by every /s/[username]/* route); this page only
// needs its own section's data.
export default async function EditProfilePage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const profileRow = await db.profile.findUnique({ where: { userId: currentUser.id } });
  if (!profileRow) redirect("/claim-username");

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Edit profile</h2>
      <EditProfileForm
        displayName={profileRow.displayName}
        bio={profileRow.bio}
        avatarUrl={profileRow.avatarUrl}
        coverUrl={profileRow.coverUrl}
        themePreset={profileRow.themePreset}
        isPrivate={profileRow.isPrivate}
      />
    </div>
  );
}
