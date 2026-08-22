import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { getPrivacySettings, updatePrivacySettings as apiUpdatePrivacySettings, ApiError } from "../src/api/client";
import { EmptyState } from "../src/components/EmptyState";
import { BottomSheet } from "../src/components/BottomSheet";
import { haptics } from "../src/utils/haptics";
import { useTheme, type Theme } from "../src/theme";
import type { PrivacySettings } from "../src/api/types";

const DM_OPTIONS: { value: string; label: string }[] = [
  { value: "everyone", label: "Everyone" },
  { value: "followers", label: "People you follow" },
  { value: "none", label: "No one" },
];

// Mirrors PrivacySettingsForm.tsx (web) — same three Profile fields, same
// SettingsRow-style rows, just RN's own Switch instead of the web Switch
// component (notification-preferences.tsx already established that as this
// app's own convention for a settings toggle).
export default function PrivacySettingsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = () => {
    getPrivacySettings()
      .then((res) => {
        setSettings(res);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your privacy settings."));
  };

  useEffect(load, []);

  async function save(patch: Partial<PrivacySettings>) {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, ...patch });
    haptics.light();
    try {
      const updated = await apiUpdatePrivacySettings(patch);
      setSettings(updated);
    } catch (err) {
      haptics.warning();
      setSettings(previous);
      setError(err instanceof ApiError ? err.message : "Could not save that change.");
    }
  }

  if (error && !settings) {
    return (
      <View style={styles.screen}>
        <EmptyState icon="lock-closed-outline" message={error} onRetry={load} />
      </View>
    );
  }

  if (!settings) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  const dmLabel = DM_OPTIONS.find((o) => o.value === settings.allowDmsFrom)?.label ?? "Everyone";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.group}>
        <Row
          label="Who can message you"
          value={dmLabel}
          onPress={() => setPickerOpen(true)}
        />
        <ToggleRow
          label="Allow others to tag you"
          value={settings.allowTagging}
          onValueChange={(v) => save({ allowTagging: v })}
        />
        <ToggleRow
          label="Show my profile in search results"
          value={settings.discoverableInSearch}
          onValueChange={(v) => save({ discoverableInSearch: v })}
          last
        />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <BottomSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Who can message you">
        {DM_OPTIONS.map((option) => (
          <Row
            key={option.value}
            label={option.label}
            selected={option.value === settings.allowDmsFrom}
            onPress={() => {
              setPickerOpen(false);
              save({ allowDmsFrom: option.value });
            }}
          />
        ))}
      </BottomSheet>
    </ScrollView>
  );
}

function Row({
  label,
  value,
  selected,
  onPress,
}: {
  label: string;
  value?: string;
  selected?: boolean;
  onPress: () => void;
}) {
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
      {value !== undefined ? <Text style={styles.rowValue}>{value}</Text> : null}
      {selected ? <Text style={[styles.rowValue, { color: theme.colors.accent }]}>✓</Text> : null}
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
  last,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  last?: boolean;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
        thumbColor={theme.colors.surface}
        accessibilityLabel={label}
      />
    </View>
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
    rowValue: { color: theme.colors.mutedForeground, fontSize: theme.text.base },
    errorText: { color: theme.colors.danger, fontSize: theme.text.sm },
  });
}
