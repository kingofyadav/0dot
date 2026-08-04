import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteSkill, moveSkill } from "@/app/actions/skills";
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
      {mySkills.length === 0 && <p className="mutedText">No skills listed yet.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {mySkills.map((skill, index) => (
          <div key={skill.id} className="profileLinkItem" style={{ justifyContent: "space-between" }}>
            <span>
              {skill.name}{" "}
              <span className="mutedText">
                {skill.endorsementCount} endorsement{skill.endorsementCount === 1 ? "" : "s"}
              </span>
            </span>
            <span style={{ display: "flex", gap: "0.25rem" }}>
              <form action={moveSkill}>
                <input type="hidden" name="skillId" value={skill.id} />
                <input type="hidden" name="direction" value="up" />
                <button type="submit" className="button buttonSecondary iconButton" disabled={index === 0} aria-label="Move up">↑</button>
              </form>
              <form action={moveSkill}>
                <input type="hidden" name="skillId" value={skill.id} />
                <input type="hidden" name="direction" value="down" />
                <button type="submit" className="button buttonSecondary iconButton" disabled={index === mySkills.length - 1} aria-label="Move down">↓</button>
              </form>
              <form action={deleteSkill}>
                <input type="hidden" name="skillId" value={skill.id} />
                <button type="submit" className="button buttonSecondary iconButton" aria-label="Delete skill">✕</button>
              </form>
            </span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: "0.5rem" }}>
        <AddSkillForm />
      </div>
    </div>
  );
}
