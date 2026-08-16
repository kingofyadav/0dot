"use client";

import { useActionState } from "react";
import { updatePreferences } from "@/app/actions/preferences";
import { LOCALES, TIMEZONES } from "@/lib/preferences";
import { SettingsRow } from "@/components/SettingsRow";
import { Switch } from "@/components/Switch";

const LOCALE_LABELS: Record<(typeof LOCALES)[number], string> = {
  "en-US": "English (US)",
  "en-GB": "English (UK)",
  "en-IN": "English (India)",
  "es-ES": "Español",
  "fr-FR": "Français",
  "de-DE": "Deutsch",
  "pt-BR": "Português (Brasil)",
  "hi-IN": "हिन्दी",
  "ja-JP": "日本語",
  "zh-CN": "中文",
};

type AccessibilityPrefs = { reducedMotion: boolean; fontScale: string; highContrast: boolean };

export function PreferencesForm({
  locale,
  timezone,
  accessibilityPrefs,
}: {
  locale: string | null;
  timezone: string | null;
  accessibilityPrefs: AccessibilityPrefs;
}) {
  const [state, formAction, pending] = useActionState(updatePreferences, undefined);

  return (
    <form action={formAction}>
      <div className="settingsGroup">
        <SettingsRow
          label="Language"
          trailing={
            <select id="locale" name="locale" defaultValue={locale ?? "en-US"} className="settingsRowSelect">
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_LABELS[l]}
                </option>
              ))}
            </select>
          }
        />
        <SettingsRow
          label="Timezone"
          trailing={
            <select id="timezone" name="timezone" defaultValue={timezone ?? "UTC"} className="settingsRowSelect">
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          }
        />
        <SettingsRow
          label="Text size"
          trailing={
            <select
              id="fontScale"
              name="fontScale"
              defaultValue={accessibilityPrefs.fontScale}
              className="settingsRowSelect"
            >
              <option value="default">Default</option>
              <option value="large">Large</option>
              <option value="larger">Larger</option>
            </select>
          }
        />
        <SettingsRow
          label="Reduce motion"
          trailing={
            <Switch name="reducedMotion" value="on" defaultChecked={accessibilityPrefs.reducedMotion} aria-label="Reduce motion" />
          }
        />
        <SettingsRow
          label="High contrast"
          trailing={
            <Switch name="highContrast" value="on" defaultChecked={accessibilityPrefs.highContrast} aria-label="High contrast" />
          }
        />
      </div>

      {state?.error && <p className="errorText">{state.error}</p>}
      {state?.success && <p className="mutedText">Preferences saved.</p>}

      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
