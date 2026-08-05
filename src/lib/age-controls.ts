import "server-only";

// phase-12 spec §8.3: no exact age floor is handed down by product/legal
// (§10 flags this as an explicit open question) — 18 is this
// implementation's engineering default for the payout-account gate, kept
// in one named constant so it's trivial to change once real guidance
// lands, not scattered as a magic number at each call site.
export const PAYOUT_MINIMUM_AGE_YEARS = 18;

export function computeAgeYears(dateOfBirth: Date, now: Date = new Date()): number {
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > dateOfBirth.getMonth() ||
    (now.getMonth() === dateOfBirth.getMonth() && now.getDate() >= dateOfBirth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

// phase-12 spec §8.4 acceptance criterion: an account with no date_of_birth
// on file is never treated as an adult by default — this returns false for
// both "unknown" and "known but under the floor", the same default-deny
// shape either way.
export function meetsPayoutAgeFloor(dateOfBirth: Date | null): boolean {
  if (!dateOfBirth) return false;
  return computeAgeYears(dateOfBirth) >= PAYOUT_MINIMUM_AGE_YEARS;
}
