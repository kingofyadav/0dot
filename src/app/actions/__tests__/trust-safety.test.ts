import { describe, it, expect } from "vitest";
import { fileAppealAction } from "@/app/actions/trust-safety";
import { createUser, createSessionForUser, createPost } from "@/test/factories";
import { setSessionCookie } from "@/test/next-test-state";
import { db } from "@/lib/db";

async function loginAs(userId: string) {
  const token = await createSessionForUser(userId);
  setSessionCookie(token);
}

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

async function createResolvedCase(subjectType: string, subjectId: string) {
  return db.trustSafetyCase.create({
    data: { caseType: "content_report", subjectType, subjectId, status: "resolved_upheld" },
  });
}

// Regression coverage: fileAppealAction's own header comment says appeals
// are "filed by the affected party," but nothing enforced that — any
// verified user could appeal any resolved case, not just the person whose
// content/account it was about.
describe("fileAppealAction", () => {
  it("lets the affected post author file an appeal", async () => {
    const author = await createUser();
    const post = await createPost({ authorId: author.id });
    const trustSafetyCase = await createResolvedCase("post", post.id);
    await loginAs(author.id);

    await fileAppealAction(formData({ caseId: trustSafetyCase.id, statement: "This was a mistake." }));

    const appeal = await db.appeal.findFirst({ where: { originalCaseId: trustSafetyCase.id } });
    expect(appeal?.filedById).toBe(author.id);
  });

  it("rejects an appeal filed by someone other than the affected party", async () => {
    const author = await createUser();
    const post = await createPost({ authorId: author.id });
    const trustSafetyCase = await createResolvedCase("post", post.id);
    const bystander = await createUser();
    await loginAs(bystander.id);

    await fileAppealAction(formData({ caseId: trustSafetyCase.id, statement: "Let me litigate someone else's case." }));

    const appeal = await db.appeal.findFirst({ where: { originalCaseId: trustSafetyCase.id } });
    expect(appeal).toBeNull();
  });
});
