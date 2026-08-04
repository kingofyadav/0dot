"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwnProfile } from "@/lib/auth-guards";
import { parsePortfolioLayout, serializePortfolioLayout, PORTFOLIO_SECTION_KEYS, type PortfolioSectionKey } from "@/lib/portfolio-layout";

function isPortfolioSectionKey(value: string): value is PortfolioSectionKey {
  return (PORTFOLIO_SECTION_KEYS as readonly string[]).includes(value);
}

// Same swap-adjacent-entry convention moveLink/moveSkill use for DB
// position columns, applied to the JSON-array order instead — this
// codebase's one ordering mechanism, reused a fourth time.
export async function movePortfolioSection(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const key = String(formData.get("key") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!isPortfolioSectionKey(key) || (direction !== "up" && direction !== "down")) return;

  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  if (!profile) return;

  const entries = parsePortfolioLayout(profile.portfolioLayoutJson);
  const index = entries.findIndex((e) => e.key === key);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapIndex < 0 || swapIndex >= entries.length) return;

  [entries[index], entries[swapIndex]] = [entries[swapIndex], entries[index]];
  await db.profile.update({ where: { id: profile.id }, data: { portfolioLayoutJson: serializePortfolioLayout(entries) } });

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
  if (user.username) revalidatePath(`/${user.username.handle}`);
}

export async function togglePortfolioSectionVisibility(formData: FormData): Promise<void> {
  const user = await requireOwnProfile();
  const key = String(formData.get("key") ?? "");
  if (!isPortfolioSectionKey(key)) return;

  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  if (!profile) return;

  const entries = parsePortfolioLayout(profile.portfolioLayoutJson).map((e) =>
    e.key === key ? { ...e, visible: !e.visible } : e
  );
  await db.profile.update({ where: { id: profile.id }, data: { portfolioLayoutJson: serializePortfolioLayout(entries) } });

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
  if (user.username) revalidatePath(`/${user.username.handle}`);
}
