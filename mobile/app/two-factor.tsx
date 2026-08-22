import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import {
  getTwoFactorStatus,
  enrollTwoFactor,
  confirmTwoFactor,
  disableTwoFactor,
  regenerateRecoveryCodes,
  ApiError,
} from "../src/api/client";
import { PasswordInput } from "../src/components/PasswordInput";
import { Button } from "../src/components/Button";
import { haptics } from "../src/utils/haptics";
import { useTheme, type Theme } from "../src/theme";

type Step = "loading" | "off" | "enroll-qr" | "enroll-confirm" | "recovery-codes" | "on" | "disable" | "regenerated";

// Mirrors TwoFactorSetupForm.tsx (web) — QR -> confirm code -> show
// recovery codes once, same multi-step shape. The QR is rendered directly
// from the server's own data: URI (qrDataUrl, built by lib/two-factor.ts's
// buildEnrollmentUri via the `qrcode` package server-side) — no QR-rendering
// dependency needed on the client.
export default function TwoFactorScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [step, setStep] = useState<Step>("loading");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTwoFactorStatus()
      .then((res) => setStep(res.enabled ? "on" : "off"))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load two-factor status."));
  }, []);

  async function onStartEnroll() {
    setSaving(true);
    setError(null);
    try {
      const res = await enrollTwoFactor();
      setQrDataUrl(res.qrDataUrl);
      setOtpauthUrl(res.otpauthUrl);
      setStep("enroll-qr");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start enrollment.");
    } finally {
      setSaving(false);
    }
  }

  async function onConfirmEnroll() {
    if (code.trim().length !== 6) return;
    setSaving(true);
    setError(null);
    try {
      const res = await confirmTwoFactor(code.trim());
      setRecoveryCodes(res.recoveryCodes);
      setStep("recovery-codes");
      haptics.light();
    } catch (err) {
      haptics.warning();
      setError(err instanceof ApiError ? err.message : "That code didn't match.");
    } finally {
      setSaving(false);
    }
  }

  // Now gated behind a confirm, same as every other security-critical
  // action in the app (deactivate/delete account, sign out everywhere) —
  // this previously fired the instant the button was tapped, the one
  // action in this class with no confirmation step at all.
  function onDisable() {
    if (!currentPassword) return;
    Alert.alert("Disable two-factor authentication?", "This removes the extra sign-in step protecting your account.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disable",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          setError(null);
          try {
            await disableTwoFactor(currentPassword);
            haptics.light();
            setCurrentPassword("");
            setStep("off");
          } catch (err) {
            haptics.warning();
            setError(err instanceof ApiError ? err.message : "Could not disable two-factor authentication.");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  async function onRegenerate() {
    if (!currentPassword) return;
    setSaving(true);
    setError(null);
    try {
      const res = await regenerateRecoveryCodes(currentPassword);
      setRecoveryCodes(res.recoveryCodes);
      setCurrentPassword("");
      setStep("regenerated");
      haptics.light();
    } catch (err) {
      haptics.warning();
      setError(err instanceof ApiError ? err.message : "Could not regenerate recovery codes.");
    } finally {
      setSaving(false);
    }
  }

  if (step === "loading") {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {step === "off" && (
        <>
          <Text style={styles.hint}>
            Add an extra layer of security — after your password, you&apos;ll also need a code from an authenticator app to sign in.
          </Text>
          <Button label="Set up two-factor authentication" onPress={onStartEnroll} loading={saving} />
        </>
      )}

      {step === "enroll-qr" && qrDataUrl && (
        <>
          <Text style={styles.hint}>Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, ...).</Text>
          <Image source={{ uri: qrDataUrl }} style={styles.qr} contentFit="contain" alt="Two-factor authentication enrollment QR code" />
          {otpauthUrl ? <Text style={styles.mono}>{otpauthUrl}</Text> : null}
          <View style={styles.field}>
            <Text style={styles.label}>Enter the 6-digit code from your app</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={theme.colors.mutedForeground}
              keyboardType="number-pad"
              maxLength={6}
              accessibilityLabel="Authenticator code"
            />
          </View>
          <Button label="Confirm" onPress={onConfirmEnroll} loading={saving} disabled={code.trim().length !== 6} />
        </>
      )}

      {step === "recovery-codes" && (
        <RecoveryCodesView
          styles={styles}
          codes={recoveryCodes}
          onDone={() => {
            setCode("");
            setStep("on");
          }}
        />
      )}

      {step === "regenerated" && (
        <RecoveryCodesView styles={styles} codes={recoveryCodes} onDone={() => setStep("on")} />
      )}

      {step === "on" && (
        <>
          <Text style={styles.hint}>Two-factor authentication is on for your account.</Text>
          <View style={styles.field}>
            <Text style={styles.label}>Current password</Text>
            <PasswordInput value={currentPassword} onChangeText={setCurrentPassword} accessibilityLabel="Current password" autoComplete="current-password" />
          </View>
          <Button label="Regenerate recovery codes" variant="secondary" onPress={onRegenerate} loading={saving} disabled={!currentPassword} />
          <Button label="Disable two-factor authentication" variant="danger" onPress={onDisable} loading={saving} disabled={!currentPassword} />
        </>
      )}
    </ScrollView>
  );
}

function RecoveryCodesView({
  styles,
  codes,
  onDone,
}: {
  styles: ReturnType<typeof createStyles>;
  codes: string[];
  onDone: () => void;
}) {
  return (
    <>
      <Text style={styles.hint}>
        Save these recovery codes somewhere safe. Each one can be used once to sign in if you lose access to your authenticator app —
        they won&apos;t be shown again.
      </Text>
      <View style={styles.codesBox}>
        {codes.map((c) => (
          <Text key={c} style={styles.mono}>
            {c}
          </Text>
        ))}
      </View>
      <Button label="Done" onPress={onDone} />
    </>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    center: { alignItems: "center", justifyContent: "center" },
    content: { padding: theme.space[5], gap: theme.space[4] },
    hint: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    errorText: { color: theme.colors.danger, fontSize: theme.text.sm },
    field: { gap: theme.space[2] },
    label: { fontSize: theme.text.sm, fontWeight: theme.weight.label, color: theme.colors.mutedForeground },
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
    qr: { width: 220, height: 220, alignSelf: "center", backgroundColor: "#fff", borderRadius: theme.radius.md },
    mono: { fontFamily: "monospace", fontSize: theme.text.sm, color: theme.colors.foreground },
    codesBox: {
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      padding: theme.space[4],
      gap: theme.space[2],
    },
  });
}
