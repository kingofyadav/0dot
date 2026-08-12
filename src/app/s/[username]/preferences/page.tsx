import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { PreferencesForm } from "./PreferencesForm";

const DEFAULT_ACCESSIBILITY_PREFS = { reducedMotion: false, fontScale: "default", highContrast: false };

export default async function PreferencesPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const accessibilityPrefs = currentUser.accessibilityPrefsJson
    ? { ...DEFAULT_ACCESSIBILITY_PREFS, ...JSON.parse(currentUser.accessibilityPrefsJson) }
    : DEFAULT_ACCESSIBILITY_PREFS;

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Language & accessibility</h2>
      <PreferencesForm locale={currentUser.locale} timezone={currentUser.timezone} accessibilityPrefs={accessibilityPrefs} />
    </div>
  );
}
