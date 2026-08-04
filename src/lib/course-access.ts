import "server-only";
import { db } from "@/lib/db";
import { hasTierAccess } from "@/lib/tier-access";

// spec §11.2: a user has access to a course if they're its creator, hold a
// CourseAccessGrant (the purchase path — a persisted row), or currently
// qualify for the course's requiredTierId via an effectively active
// subscription (the membership-bundle path — checked live every call,
// never materialized, so it evaporates the instant a subscription lapses).
// These two paths are deliberately never conflated (§11.2's second
// criterion): a purchase grant persists regardless of subscription state.
export async function hasCourseAccess(userId: string | null, courseId: string): Promise<boolean> {
  const course = await db.course.findUnique({ where: { id: courseId }, select: { creatorId: true, requiredTierId: true } });
  if (!course) return false;
  if (!userId) return false;
  if (userId === course.creatorId) return true;

  const grant = await db.courseAccessGrant.findUnique({ where: { courseId_userId: { courseId, userId } } });
  if (grant) return true;

  if (course.requiredTierId) return hasTierAccess(userId, course.creatorId, course.requiredTierId);
  return false;
}
