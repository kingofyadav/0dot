// Countries Stripe's cross-border Connect payouts currently support when
// the platform account is US-based (this platform's case): US, UK, EEA,
// Canada, Switzerland can each pay out to any of these same regions.
// Verified against docs.stripe.com/connect/cross-border-payouts -- Stripe
// changes this list over time, so re-check there before adding countries,
// don't extend from memory.
export const STRIPE_CONNECT_SUPPORTED_COUNTRIES: readonly { iso: string; name: string }[] = [
  { iso: "US", name: "United States" },
  { iso: "GB", name: "United Kingdom" },
  { iso: "CA", name: "Canada" },
  { iso: "CH", name: "Switzerland" },
  // EEA (EU-27 + Iceland, Liechtenstein, Norway)
  { iso: "AT", name: "Austria" },
  { iso: "BE", name: "Belgium" },
  { iso: "BG", name: "Bulgaria" },
  { iso: "HR", name: "Croatia" },
  { iso: "CY", name: "Cyprus" },
  { iso: "CZ", name: "Czechia" },
  { iso: "DK", name: "Denmark" },
  { iso: "EE", name: "Estonia" },
  { iso: "FI", name: "Finland" },
  { iso: "FR", name: "France" },
  { iso: "DE", name: "Germany" },
  { iso: "GR", name: "Greece" },
  { iso: "HU", name: "Hungary" },
  { iso: "IE", name: "Ireland" },
  { iso: "IT", name: "Italy" },
  { iso: "LV", name: "Latvia" },
  { iso: "LT", name: "Lithuania" },
  { iso: "LU", name: "Luxembourg" },
  { iso: "MT", name: "Malta" },
  { iso: "NL", name: "Netherlands" },
  { iso: "PL", name: "Poland" },
  { iso: "PT", name: "Portugal" },
  { iso: "RO", name: "Romania" },
  { iso: "SK", name: "Slovakia" },
  { iso: "SI", name: "Slovenia" },
  { iso: "ES", name: "Spain" },
  { iso: "SE", name: "Sweden" },
  { iso: "IS", name: "Iceland" },
  { iso: "LI", name: "Liechtenstein" },
  { iso: "NO", name: "Norway" },
];

const SUPPORTED_ISO = new Set(STRIPE_CONNECT_SUPPORTED_COUNTRIES.map((c) => c.iso));

export function isStripeConnectSupportedCountry(iso: string): boolean {
  return SUPPORTED_ISO.has(iso);
}

// Shown disabled in the picker so India doesn't just silently disappear --
// the restriction is Stripe cross-border/regulatory (platforms outside
// US/UK/EEA/CA/CH can't self-serve payout to India), not a bug. Revisit once
// platform verification and Stripe's own guidance on the India corridor are
// resolved.
export const PAYOUT_COUNTRY_COMING_SOON: readonly { iso: string; name: string }[] = [
  { iso: "IN", name: "India (coming soon)" },
];
