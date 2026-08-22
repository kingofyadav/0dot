import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { changePassword, ApiError } from "../src/api/client";
import { PasswordInput } from "../src/components/PasswordInput";
import { Button } from "../src/components/Button";
import { haptics } from "../src/utils/haptics";
import { useTheme, type Theme } from "../src/theme";

// Mirrors ChangePasswordForm.tsx (web) — same three fields, same
// client-side checks (length, match) ahead of the server's own.
export default function ChangePasswordScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword && !saving;

  async function onSave() {
    if (!canSave) return;
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await changePassword({ currentPassword, newPassword });
      haptics.light();
      router.back();
    } catch (err) {
      haptics.warning();
      setError(err instanceof ApiError ? err.message : "Could not update your password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.hint}>Choose a strong, unique password. Changing it signs you out of every other device.</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Current password</Text>
        <PasswordInput value={currentPassword} onChangeText={setCurrentPassword} accessibilityLabel="Current password" autoComplete="current-password" />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>New password</Text>
        <PasswordInput value={newPassword} onChangeText={setNewPassword} accessibilityLabel="New password" autoComplete="new-password" />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Confirm new password</Text>
        <PasswordInput value={confirmPassword} onChangeText={setConfirmPassword} accessibilityLabel="Confirm new password" autoComplete="new-password" />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Button label="Update password" onPress={onSave} loading={saving} disabled={!canSave} style={styles.button} />
    </ScrollView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.space[5], gap: theme.space[4] },
    hint: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    field: { gap: theme.space[2] },
    label: { fontSize: theme.text.sm, fontWeight: theme.weight.label, color: theme.colors.mutedForeground },
    errorText: { color: theme.colors.danger, fontSize: theme.text.sm },
    button: { marginTop: theme.space[2] },
  });
}
