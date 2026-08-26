import { redirect } from "next/navigation";
import { ChevronUp, ChevronDown, Sparkles, X } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteSkill, moveSkill } from "@/app/actions/skills";
import { SettingsRow } from "@/components/SettingsRow";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmButton } from "@/components/ConfirmButton";
import { AddSkillForm } from "../../AddSkillForm";

export default async function SkillsSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const mySkills = await db.skill.findMany({
    where: { profile: { userId: currentUser.id } },
    orderBy: { position: "asc" },
  });

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Skills</h2>
      {mySkills.length === 0 ? (
        <EmptyState message="No skills listed yet." />
      ) : (
        <div className="settingsGroup">
          {mySkills.map((skill, index) => (
            <SettingsRow
              key={skill.id}
              icon={Sparkles}
              label={skill.name}
              description={`${skill.endorsementCount} endorsement${skill.endorsementCount === 1 ? "" : "s"}`}
              trailing={
                <>
                  <form action={moveSkill}>
                    <input type="hidden" name="skillId" value={skill.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button type="submit" className="button buttonSecondary iconButton" disabled={index === 0} aria-label="Move up"><ChevronUp size={16} aria-hidden="true" /></button>
                  </form>
                  <form action={moveSkill}>
                    <input type="hidden" name="skillId" value={skill.id} />
                    <input type="hidden" name="direction" value="down" />
                    <button type="submit" className="button buttonSecondary iconButton" disabled={index === mySkills.length - 1} aria-label="Move down"><ChevronDown size={16} aria-hidden="true" /></button>
                  </form>
                  <form action={deleteSkill}>
                    <input type="hidden" name="skillId" value={skill.id} />
                    <ConfirmButton
                      className="button buttonSecondary iconButton"
                      title="Delete this skill?"
                      description="This can't be undone."
                      confirmLabel="Delete"
                      aria-label="Delete skill"
                    >
                      <X size={16} aria-hidden="true" />
                    </ConfirmButton>
                  </form>
                </>
              }
            />
          ))}
        </div>
      )}
      <p className="settingsGroupLabel">Add a skill</p>
      <div className="settingsGroup">
        <div className="settingsAddPanelBody">
          <AddSkillForm />
        </div>
      </div>
    </div>
  );
}
