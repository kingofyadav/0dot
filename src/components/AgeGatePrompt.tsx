import { setDateOfBirth } from "@/app/actions/age";

// phase-12 spec §8.2: prompts an existing account (created before this
// phase, so date_of_birth is null) at next login rather than backfilling
// or guessing. Rendered directly in RootLayout — every account with an
// unknown DOB sees this on every page until answered, same "can't be
// dismissed away" posture as the underlying default protective
// restriction it exists to lift.
export function AgeGatePrompt() {
  return (
    <div className="profileCard" role="region" aria-label="Confirm your date of birth" style={{ margin: "0.75rem", padding: "0.85rem 1rem" }}>
      <form action={setDateOfBirth} style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
        <label htmlFor="age-gate-dob" style={{ fontSize: "0.9rem" }}>
          Please confirm your date of birth — some features are restricted until this is on file.
        </label>
        <input id="age-gate-dob" type="date" name="dateOfBirth" className="textInput" required />
        <button type="submit" className="button buttonSmall">
          Confirm
        </button>
      </form>
    </div>
  );
}
