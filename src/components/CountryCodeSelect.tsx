"use client";

import { COUNTRY_CODES } from "@/lib/country-codes";

// Split out of AuthTabs (dynamic-imported there, see its own comment) so the
// ~195-entry country list ships as its own chunk instead of riding along in
// the auth form's critical hydration path.
export function CountryCodeSelect() {
  return (
    <select
      id="signup-phoneDialCode"
      name="phoneDialCode"
      autoComplete="tel-country-code"
      defaultValue="91"
      aria-label="Country dial code"
      style={{ flex: "0 0 auto" }}
      required
    >
      {COUNTRY_CODES.map((c) => (
        <option key={c.iso} value={c.dialCode}>
          {c.iso} +{c.dialCode}
        </option>
      ))}
    </select>
  );
}
