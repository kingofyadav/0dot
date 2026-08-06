// A single source of truth for signup's mobile-number country selector today
// — reused later wherever a phone gets collected or displayed (e.g. a future
// phone-login/verification flow), so the list doesn't fork.
export type CountryCode = {
  /** ISO 3166-1 alpha-2, used as the <option> value and key. */
  iso: string;
  name: string;
  /** E.164 calling code, digits only (no "+"). */
  dialCode: string;
};

export const COUNTRY_CODES: CountryCode[] = [
  { iso: "IN", name: "India", dialCode: "91" },
  { iso: "US", name: "United States", dialCode: "1" },
  { iso: "CA", name: "Canada", dialCode: "1" },
  { iso: "GB", name: "United Kingdom", dialCode: "44" },
  { iso: "AU", name: "Australia", dialCode: "61" },
  { iso: "NZ", name: "New Zealand", dialCode: "64" },
  { iso: "IE", name: "Ireland", dialCode: "353" },
  { iso: "DE", name: "Germany", dialCode: "49" },
  { iso: "FR", name: "France", dialCode: "33" },
  { iso: "ES", name: "Spain", dialCode: "34" },
  { iso: "IT", name: "Italy", dialCode: "39" },
  { iso: "NL", name: "Netherlands", dialCode: "31" },
  { iso: "PT", name: "Portugal", dialCode: "351" },
  { iso: "SE", name: "Sweden", dialCode: "46" },
  { iso: "NO", name: "Norway", dialCode: "47" },
  { iso: "DK", name: "Denmark", dialCode: "45" },
  { iso: "FI", name: "Finland", dialCode: "358" },
  { iso: "PL", name: "Poland", dialCode: "48" },
  { iso: "CH", name: "Switzerland", dialCode: "41" },
  { iso: "AT", name: "Austria", dialCode: "43" },
  { iso: "BE", name: "Belgium", dialCode: "32" },
  { iso: "GR", name: "Greece", dialCode: "30" },
  { iso: "TR", name: "Turkey", dialCode: "90" },
  { iso: "RU", name: "Russia", dialCode: "7" },
  { iso: "UA", name: "Ukraine", dialCode: "380" },
  { iso: "ZA", name: "South Africa", dialCode: "27" },
  { iso: "NG", name: "Nigeria", dialCode: "234" },
  { iso: "KE", name: "Kenya", dialCode: "254" },
  { iso: "EG", name: "Egypt", dialCode: "20" },
  { iso: "AE", name: "United Arab Emirates", dialCode: "971" },
  { iso: "SA", name: "Saudi Arabia", dialCode: "966" },
  { iso: "IL", name: "Israel", dialCode: "972" },
  { iso: "PK", name: "Pakistan", dialCode: "92" },
  { iso: "BD", name: "Bangladesh", dialCode: "880" },
  { iso: "LK", name: "Sri Lanka", dialCode: "94" },
  { iso: "NP", name: "Nepal", dialCode: "977" },
  { iso: "CN", name: "China", dialCode: "86" },
  { iso: "JP", name: "Japan", dialCode: "81" },
  { iso: "KR", name: "South Korea", dialCode: "82" },
  { iso: "SG", name: "Singapore", dialCode: "65" },
  { iso: "MY", name: "Malaysia", dialCode: "60" },
  { iso: "ID", name: "Indonesia", dialCode: "62" },
  { iso: "TH", name: "Thailand", dialCode: "66" },
  { iso: "VN", name: "Vietnam", dialCode: "84" },
  { iso: "PH", name: "Philippines", dialCode: "63" },
  { iso: "MX", name: "Mexico", dialCode: "52" },
  { iso: "BR", name: "Brazil", dialCode: "55" },
  { iso: "AR", name: "Argentina", dialCode: "54" },
  { iso: "CL", name: "Chile", dialCode: "56" },
  { iso: "CO", name: "Colombia", dialCode: "57" },
];

const DIAL_CODES = new Set(COUNTRY_CODES.map((c) => c.dialCode));

/**
 * Normalizes a country dial code + local number into a bare E.164 string
 * ("+<dialcode><digits>", no formatting) or null if either half doesn't hold
 * up: unrecognized dial code, or a digit count outside E.164's 7-15 total.
 */
export function toE164(dialCode: string, localNumber: string): string | null {
  if (!DIAL_CODES.has(dialCode)) return null;
  const digits = localNumber.replace(/[^0-9]/g, "");
  const combined = `${dialCode}${digits}`;
  if (combined.length < 7 || combined.length > 15) return null;
  return `+${combined}`;
}
