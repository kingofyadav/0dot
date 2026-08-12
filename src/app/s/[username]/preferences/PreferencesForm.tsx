"use client";

import { useActionState } from "react";
import { updatePreferences } from "@/app/actions/preferences";
import { LOCALES, TIMEZONES } from "@/lib/preferences";

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
    <form action={formAction} className="authCard" style={{ maxWidth: "none" }}>
      <div className="field">
        <label htmlFor="locale">Language</label>
        <select id="locale" name="locale" defaultValue={locale ?? "en-US"}>
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_LABELS[l]}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="timezone">Timezone</label>
        <select id="timezone" name="timezone" defaultValue={timezone ?? "UTC"}>
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="fontScale">Text size</label>
        <select id="fontScale" name="fontScale" defaultValue={accessibilityPrefs.fontScale}>
          <option value="default">Default</option>
          <option value="large">Large</option>
          <option value="larger">Larger</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="reducedMotion" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            id="reducedMotion"
            name="reducedMotion"
            type="checkbox"
            defaultChecked={accessibilityPrefs.reducedMotion}
            style={{ width: "auto" }}
          />
          Reduce motion
        </label>
      </div>

      <div className="field">
        <label htmlFor="highContrast" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            id="highContrast"
            name="highContrast"
            type="checkbox"
            defaultChecked={accessibilityPrefs.highContrast}
            style={{ width: "auto" }}
          />
          High contrast
        </label>
      </div>

      {state?.error && <p className="errorText">{state.error}</p>}
      {state?.success && <p className="mutedText">Preferences saved.</p>}

      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
