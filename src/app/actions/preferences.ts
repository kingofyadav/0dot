"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { LOCALES, TIMEZONES } from "@/lib/preferences";
import type { ActionState } from "@/app/actions/auth";

const FONT_SCALES = new Set(["default", "large", "larger"]);

type AccessibilityPrefs = { reducedMotion: boolean; fontScale: string; highContrast: boolean };

// addendum §11: locale/timezone are plain User columns; accessibility prefs
// are hand-serialized JSON (User.accessibilityPrefsJson) since there's no
// native Json scalar in this schema, same convention as hoursJson/
// imagesJson elsewhere. Curated small lists (LOCALES/TIMEZONES above), not
// a full IANA/locale database, matching this app's existing posture for
// notification types.
export async function updatePreferences(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();

  const locale = String(formData.get("locale") ?? "");
  const timezone = String(formData.get("timezone") ?? "");
  const fontScale = String(formData.get("fontScale") ?? "default");

  if (locale && !(LOCALES as readonly string[]).includes(locale)) {
    return { error: "Choose a valid language." };
  }
  if (timezone && !(TIMEZONES as readonly string[]).includes(timezone)) {
    return { error: "Choose a valid timezone." };
  }
  if (!FONT_SCALES.has(fontScale)) {
    return { error: "Choose a valid text size." };
  }

  const accessibilityPrefs: AccessibilityPrefs = {
    reducedMotion: formData.get("reducedMotion") === "on",
    fontScale,
    highContrast: formData.get("highContrast") === "on",
  };

  await db.user.update({
    where: { id: user.id },
    data: {
      locale: locale || null,
      timezone: timezone || null,
      accessibilityPrefsJson: JSON.stringify(accessibilityPrefs),
    },
  });

  // Every layout render reads accessibilityPrefsJson (RootLayout,
  // src/app/layout.tsx) to set the data-* attributes on <html> — revalidate
  // broadly so the change is visible without a full reload.
  revalidatePath("/", "layout");
  return { success: true };
}
