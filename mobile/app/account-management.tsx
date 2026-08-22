import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { exportAccountData, deactivateAccount, deleteAccount, ApiError } from "../src/api/client";
import { useAuth } from "../src/auth/AuthContext";
import { PasswordInput } from "../src/components/PasswordInput";
import { Button } from "../src/components/Button";
import { haptics } from "../src/utils/haptics";
import { useTheme, type Theme } from "../src/theme";

// Mirrors account/page.tsx (web) — export, then a danger zone with
// deactivate/delete, each behind its own password re-entry (ConfirmDangerForm's
// tap-to-reveal shape). No explicit sign-out call after deactivate/delete:
// resolveApiRequest's own User.status check (this addendum's finding 1 fix)
// already rejects this account's existing bearer tokens on their very next
// use, same as the web action relying on getCurrentUser()'s equivalent check.
export default function AccountManagementScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { signOut } = useAuth();

  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onExport() {
    setExporting(true);
    setError(null);
    try {
      const json = await exportAccountData();
      const path = `${FileSystem.cacheDirectory}0dot-account-export.json`;
      await FileSystem.writeAsStringAsync(path, json);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: "application/json", dialogTitle: "Save your 0dot data export" });
      }
      haptics.light();
    } catch (err) {
      haptics.warning();
      setError(err instanceof ApiError ? err.message : "Could not export your data.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionHeading}>Export your data</Text>
        <Text style={styles.hint}>Download a copy of your profile, links, posts, articles, projects, and bookmarks as JSON.</Text>
        <Button label="Export data" variant="secondary" onPress={onExport} loading={exporting} />
      </View>

      <View style={styles.divider} />

      <Text style={styles.dangerHeading}>Danger zone</Text>

      <DangerRow
        label="Deactivate account"
        description="Hides your profile and signs you out everywhere. Log back in within 30 days to reactivate — after that, your account is permanently deleted."
        confirmLabel="Deactivate account"
        pendingLabel="Deactivating…"
        onConfirm={async (password) => {
          await deactivateAccount(password);
          await signOut();
        }}
      />

      <DangerRow
        label="Delete account"
        description="Schedules your account for permanent deletion in 30 days. Logging back in before then cancels it."
        confirmLabel="Delete account"
        pendingLabel="Requesting…"
        onConfirm={async (password) => {
          await deleteAccount(password);
          await signOut();
        }}
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </ScrollView>
  );
}

function DangerRow({
  label,
  description,
  confirmLabel,
  pendingLabel,
  onConfirm,
}: {
  label: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  onConfirm: (password: string) => Promise<void>;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onPressConfirm() {
    Alert.alert(label + "?", "This can't be undone from here.", [
      { text: "Cancel", style: "cancel" },
      {
        text: confirmLabel,
        style: "destructive",
        onPress: async () => {
          setPending(true);
          setError(null);
          try {
            await onConfirm(password);
          } catch (err) {
            haptics.warning();
            setError(err instanceof ApiError ? err.message : "Could not complete this request.");
            setPending(false);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.dangerRow}>
      <Text style={styles.dangerRowLabel}>{label}</Text>
      <Text style={styles.hint}>{description}</Text>
      {!confirming ? (
        <Pressable
          onPress={() => setConfirming(true)}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={({ pressed }) => [styles.dangerButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={styles.dangerButtonText}>{label}</Text>
        </Pressable>
      ) : (
        <View style={styles.field}>
          <PasswordInput value={password} onChangeText={setPassword} accessibilityLabel="Confirm your password" autoComplete="current-password" />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.row}>
            {pending ? (
              <View style={styles.pendingRow}>
                <ActivityIndicator color={theme.colors.danger} />
                <Text style={styles.dangerRowLabel}>{pendingLabel}</Text>
              </View>
            ) : (
              <>
                <Pressable
                  onPress={onPressConfirm}
                  disabled={!password}
                  accessibilityRole="button"
                  accessibilityLabel={confirmLabel}
                  style={({ pressed }) => [styles.dangerButton, { opacity: pressed || !password ? 0.6 : 1 }]}
                >
                  <Text style={styles.dangerButtonText}>{confirmLabel}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setConfirming(false);
                    setPassword("");
                    setError(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                  style={({ pressed }) => [styles.cancelButton, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.space[5], gap: theme.space[4] },
    section: { gap: theme.space[3] },
    sectionHeading: { fontSize: theme.text.lg, fontWeight: theme.weight.heading, color: theme.colors.foreground },
    dangerHeading: { fontSize: theme.text.sm, fontWeight: theme.weight.label, color: theme.colors.danger, textTransform: "uppercase" },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },
    hint: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    errorText: { color: theme.colors.danger, fontSize: theme.text.sm },
    dangerRow: {
      gap: theme.space[2],
      padding: theme.space[4],
      borderRadius: theme.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.dangerSoft,
      backgroundColor: theme.colors.dangerSoft,
    },
    dangerRowLabel: { fontSize: theme.text.base, fontWeight: theme.weight.emphasis, color: theme.colors.danger },
    field: { gap: theme.space[3] },
    row: { flexDirection: "row", gap: theme.space[3] },
    pendingRow: { flexDirection: "row", alignItems: "center", gap: theme.space[3] },
    dangerButton: {
      minHeight: 40,
      paddingHorizontal: theme.space[4],
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.danger,
    },
    dangerButtonText: { color: theme.colors.onDanger, fontSize: theme.text.sm, fontWeight: theme.weight.emphasis },
    cancelButton: { minHeight: 40, paddingHorizontal: theme.space[4], alignItems: "center", justifyContent: "center" },
    cancelButtonText: { color: theme.colors.foreground, fontSize: theme.text.sm },
  });
}
