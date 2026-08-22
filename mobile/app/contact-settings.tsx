import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  requestEmailChange,
  requestPhoneChange,
  confirmPhoneChange,
  ApiError,
} from "../src/api/client";
import { PasswordInput } from "../src/components/PasswordInput";
import { Button } from "../src/components/Button";
import { BottomSheet } from "../src/components/BottomSheet";
import { COUNTRY_CODES } from "../src/utils/countryCodes";
import { haptics } from "../src/utils/haptics";
import { useTheme, type Theme } from "../src/theme";

// Mirrors security/contact/page.tsx (web) — ChangeEmailForm and
// ChangePhoneForm as two independent sections on one screen (that page
// itself folds both under one route too). The email flow ends in "check
// your inbox" (the verification link still lands on the web app, same as
// any platform); the phone flow is two-step (request code, then confirm),
// matching TwoFactorSetupForm's own enroll-then-confirm shape.
export default function ContactSettingsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <EmailSection styles={styles} />
      <View style={styles.divider} />
      <PhoneSection styles={styles} />
    </ScrollView>
  );
}

function EmailSection({ styles }: { styles: ReturnType<typeof createStyles> }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const theme = useTheme();
  const canSave = currentPassword.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail) && !saving;

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await requestEmailChange({ currentPassword, newEmail });
      haptics.light();
      setSent(true);
    } catch (err) {
      haptics.warning();
      setError(err instanceof ApiError ? err.message : "Could not request that change.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>Change email</Text>
      {sent ? (
        <Text style={styles.hint}>Check {newEmail} for a link to confirm the change.</Text>
      ) : (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>New email</Text>
            <TextInput
              style={styles.input}
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="you@example.com"
              placeholderTextColor={theme.colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              accessibilityLabel="New email"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Current password</Text>
            <PasswordInput value={currentPassword} onChangeText={setCurrentPassword} accessibilityLabel="Current password" autoComplete="current-password" />
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Button label="Send confirmation link" onPress={onSave} loading={saving} disabled={!canSave} />
        </>
      )}
    </View>
  );
}

function PhoneSection({ styles }: { styles: ReturnType<typeof createStyles> }) {
  const theme = useTheme();
  const [currentPassword, setCurrentPassword] = useState("");
  const [country, setCountry] = useState(COUNTRY_CODES[0]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [step, setStep] = useState<"request" | "confirm">("request");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRequest = currentPassword.length > 0 && phoneNumber.trim().length > 0 && !saving;
  const canConfirm = code.trim().length === 6 && !saving;

  async function onRequest() {
    if (!canRequest) return;
    setSaving(true);
    setError(null);
    try {
      await requestPhoneChange({ currentPassword, phoneDialCode: country.dialCode, phoneNumber });
      haptics.light();
      setStep("confirm");
    } catch (err) {
      haptics.warning();
      setError(err instanceof ApiError ? err.message : "Could not request that change.");
    } finally {
      setSaving(false);
    }
  }

  async function onConfirm() {
    if (!canConfirm) return;
    setSaving(true);
    setError(null);
    try {
      await confirmPhoneChange(code.trim());
      haptics.light();
      setStep("request");
      setCode("");
      setPhoneNumber("");
      setCurrentPassword("");
    } catch (err) {
      haptics.warning();
      setError(err instanceof ApiError ? err.message : "That code is invalid or has expired.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>Change mobile number</Text>
      {step === "request" ? (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>New mobile number</Text>
            <View style={styles.phoneRow}>
              <Text
                style={styles.dialCode}
                onPress={() => {
                  haptics.light();
                  setPickerOpen(true);
                }}
              >
                +{country.dialCode}
              </Text>
              <TextInput
                style={[styles.input, styles.phoneInput]}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                placeholder="Mobile number"
                placeholderTextColor={theme.colors.mutedForeground}
                keyboardType="phone-pad"
                accessibilityLabel="New mobile number"
              />
            </View>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Current password</Text>
            <PasswordInput value={currentPassword} onChangeText={setCurrentPassword} accessibilityLabel="Current password" autoComplete="current-password" />
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Button label="Send verification code" onPress={onRequest} loading={saving} disabled={!canRequest} />
        </>
      ) : (
        <>
          <Text style={styles.hint}>Enter the code we sent to your new number.</Text>
          <View style={styles.field}>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={setCode}
              placeholder="6-digit code"
              placeholderTextColor={theme.colors.mutedForeground}
              keyboardType="number-pad"
              maxLength={6}
              accessibilityLabel="Verification code"
            />
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Button label="Confirm" onPress={onConfirm} loading={saving} disabled={!canConfirm} />
        </>
      )}

      <BottomSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Country">
        {COUNTRY_CODES.map((c) => (
          <Text
            key={c.iso}
            style={styles.countryRow}
            onPress={() => {
              haptics.light();
              setCountry(c);
              setPickerOpen(false);
            }}
          >
            {c.name} (+{c.dialCode})
          </Text>
        ))}
      </BottomSheet>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.space[5] },
    section: { gap: theme.space[3] },
    // Matches sessions.tsx/notification-preferences.tsx/settings.tsx/
    // account-management.tsx's own section heading — this screen's own
    // version had drifted to a larger non-uppercase foreground style.
    sectionHeading: { fontSize: theme.text.sm, fontWeight: theme.weight.label, color: theme.colors.mutedForeground, textTransform: "uppercase" },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border, marginVertical: theme.space[6] },
    field: { gap: theme.space[2] },
    label: { fontSize: theme.text.sm, fontWeight: theme.weight.label, color: theme.colors.mutedForeground },
    hint: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    errorText: { color: theme.colors.danger, fontSize: theme.text.sm },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.surface,
      color: theme.colors.foreground,
      fontSize: theme.text.base,
      paddingHorizontal: theme.space[3],
      paddingVertical: theme.space[3],
      minHeight: 44,
    },
    phoneRow: { flexDirection: "row", gap: theme.space[2], alignItems: "center" },
    dialCode: {
      minHeight: 44,
      paddingHorizontal: theme.space[3],
      textAlignVertical: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.surface,
      color: theme.colors.foreground,
      fontSize: theme.text.base,
      lineHeight: 44,
    },
    phoneInput: { flex: 1 },
    countryRow: {
      color: theme.colors.foreground,
      fontSize: theme.text.base,
      paddingVertical: theme.space[3],
      paddingHorizontal: theme.space[2],
    },
  });
}
