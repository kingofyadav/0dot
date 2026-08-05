"use server";

import { revalidatePath } from "next/cache";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";

const LICENSE_TYPES = new Set(["all_rights_reserved", "cc_by", "cc_by_sa", "cc_by_nc", "cc_by_nd", "cc0", "custom"]);

// phase-13 spec §5.1: opt-in — a creator declaring *more* permissive terms
// than the all_rights_reserved default every piece of content already has
// without a row here. Ownership is checked per subjectType since there's
// no single polymorphic "owner" column to query generically; article is
// the first (and, for this build, only) wired subjectType — extending to
// project/marketplace-listing/etc. means adding a branch here, not
// changing the shape.
export async function setContentLicense(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const subjectType = String(formData.get("subjectType") ?? "");
  const subjectId = String(formData.get("subjectId") ?? "");
  const licenseType = String(formData.get("licenseType") ?? "");
  const customTerms = String(formData.get("customTerms") ?? "").trim() || null;

  if (!LICENSE_TYPES.has(licenseType)) return;
  if (licenseType === "custom" && !customTerms) return;

  if (subjectType === "article") {
    const article = await db.article.findFirst({ where: { id: subjectId, authorId: user.id } });
    if (!article) return;
  } else {
    return;
  }

  await db.contentLicense.upsert({
    where: { subjectType_subjectId: { subjectType, subjectId } },
    create: { subjectType, subjectId, licenseType, customTerms },
    update: { licenseType, customTerms, declaredAt: new Date() },
  });

  if (subjectType === "article") revalidatePath(`/${user.username?.handle}/articles`);
}
