import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { getPreferences, updatePreferences, ApiError } from "../src/api/client";
import { BottomSheet } from "../src/components/BottomSheet";
import { EmptyState } from "../src/components/EmptyState";
import { haptics } from "../src/utils/haptics";
import { useTheme, type Theme } from "../src/theme";
import type { PreferencesResponse } from "../src/api/types";

// Mirrors PreferencesForm.tsx (web), minus a reduce-motion toggle: this app
// already reads the OS-level accessibility signal everywhere
// (animateLayout.ts, Button/BottomSheet's own useReducedMotion()) — a
// second in-app switch would just fight that, not add a real option (see
// this addendum's own finding on the point). Setting it from web still
// takes effect here too, merged in behind the scenes — see
// themePreferences.tsx.
const LOCALE_LABELS: Record<string, string> = {
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
const LOCALES = Object.keys(LOCALE_LABELS);

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
];

const FONT_SCALE_LABELS: Record<string, string> = { default: "Default", large: "Large", larger: "Larger" };

export default function PreferencesScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [prefs, setPrefs] = useState<PreferencesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localePickerOpen, setLocalePickerOpen] = useState(false);
  const [timezonePickerOpen, setTimezonePickerOpen] = useState(false);
  const [fontScalePickerOpen, setFontScalePickerOpen] = useState(false);

  const load = () => {
    getPreferences()
      .then((res) => {
        setPrefs(res);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your preferences."));
  };

  useEffect(load, []);

  async function save(patch: { locale?: string; timezone?: string; fontScale?: string; highContrast?: boolean }) {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({
      ...prefs,
      locale: patch.locale ?? prefs.locale,
      timezone: patch.timezone ?? prefs.timezone,
      accessibilityPrefs: {
        ...prefs.accessibilityPrefs,
        ...(patch.fontScale !== undefined ? { fontScale: patch.fontScale } : {}),
        ...(patch.highContrast !== undefined ? { highContrast: patch.highContrast } : {}),
      },
    });
    haptics.light();
    try {
      const updated = await updatePreferences(patch);
      setPrefs(updated);
    } catch (err) {
      haptics.warning();
      setPrefs(previous);
      setError(err instanceof ApiError ? err.message : "Could not save that change.");
    }
  }

  if (error && !prefs) {
    return (
      <View style={styles.screen}>
        <EmptyState icon="options-outline" message={error} onRetry={load} />
      </View>
    );
  }

  if (!prefs) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.group}>
        <SettingsRow label="Language" value={LOCALE_LABELS[prefs.locale ?? "en-US"] ?? prefs.locale ?? "English (US)"} onPress={() => setLocalePickerOpen(true)} />
        <SettingsRow label="Timezone" value={prefs.timezone ?? "UTC"} onPress={() => setTimezonePickerOpen(true)} />
        <SettingsRow
          label="Text size"
          value={FONT_SCALE_LABELS[prefs.accessibilityPrefs.fontScale] ?? "Default"}
          onPress={() => setFontScalePickerOpen(true)}
        />
        <View style={[styles.row, styles.rowLast]}>
          <Text style={styles.rowLabel}>High contrast</Text>
          <Switch
            value={prefs.accessibilityPrefs.highContrast}
            onValueChange={(v) => save({ highContrast: v })}
            trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
            thumbColor={theme.colors.surface}
            accessibilityLabel="High contrast"
          />
        </View>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <BottomSheet visible={localePickerOpen} onClose={() => setLocalePickerOpen(false)} title="Language">
        {LOCALES.map((l) => (
          <PickerRow key={l} label={LOCALE_LABELS[l]} selected={l === prefs.locale} onPress={() => { setLocalePickerOpen(false); save({ locale: l }); }} />
        ))}
      </BottomSheet>

      <BottomSheet visible={timezonePickerOpen} onClose={() => setTimezonePickerOpen(false)} title="Timezone">
        {TIMEZONES.map((tz) => (
          <PickerRow key={tz} label={tz} selected={tz === prefs.timezone} onPress={() => { setTimezonePickerOpen(false); save({ timezone: tz }); }} />
        ))}
      </BottomSheet>

      <BottomSheet visible={fontScalePickerOpen} onClose={() => setFontScalePickerOpen(false)} title="Text size">
        {Object.entries(FONT_SCALE_LABELS).map(([value, label]) => (
          <PickerRow
            key={value}
            label={label}
            selected={value === prefs.accessibilityPrefs.fontScale}
            onPress={() => { setFontScalePickerOpen(false); save({ fontScale: value }); }}
          />
        ))}
      </BottomSheet>
    </ScrollView>
  );
}

function SettingsRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.row}>
      <Text
        style={styles.rowLabel}
        onPress={() => {
          haptics.light();
          onPress();
        }}
      >
        {label}
      </Text>
      <Text style={[styles.rowLabel, { flex: 0, color: theme.colors.mutedForeground }]}>{value}</Text>
    </View>
  );
}

function PickerRow({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <Text
      style={styles.pickerRow}
      onPress={() => {
        haptics.light();
        onPress();
      }}
    >
      {label}
      {selected ? "  ✓" : ""}
    </Text>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    center: { alignItems: "center", justifyContent: "center" },
    content: { padding: theme.space[5], gap: theme.space[3] },
    group: {
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.lg,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.space[3],
      paddingHorizontal: theme.space[4],
      paddingVertical: theme.space[3],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
      minHeight: 48,
    },
    rowLast: { borderBottomWidth: 0 },
    rowLabel: { flex: 1, color: theme.colors.foreground, fontSize: theme.text.base },
    pickerRow: { color: theme.colors.foreground, fontSize: theme.text.base, paddingVertical: theme.space[3], paddingHorizontal: theme.space[2] },
    errorText: { color: theme.colors.danger, fontSize: theme.text.sm },
  });
}
