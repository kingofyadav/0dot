import { useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme, type Theme } from "../theme";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  accessibilityLabel: string;
  autoComplete?: "current-password" | "new-password";
};

// No native login form exists anywhere else in this app (sign-in is
// PKCE/web, see pkceAuth.ts) — this is the first place a password needs to
// be typed on-device, for the current-password re-entry gate every
// sensitive M12 screen (change password, disable 2FA, deactivate/delete,
// contact change) shares with the web app's own PasswordField.tsx.
export function PasswordInput({ value, onChangeText, placeholder, accessibilityLabel, autoComplete }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrap}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.mutedForeground}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType={autoComplete === "new-password" ? "newPassword" : "password"}
        autoComplete={autoComplete}
        accessibilityLabel={accessibilityLabel}
      />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={visible ? "Hide password" : "Show password"}
        hitSlop={8}
        style={styles.toggle}
      >
        <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={18} color={theme.colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    wrap: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.surface,
    },
    input: {
      flex: 1,
      color: theme.colors.foreground,
      fontSize: theme.text.base,
      paddingHorizontal: theme.space[3],
      paddingVertical: theme.space[3],
      minHeight: 44,
    },
    toggle: { paddingHorizontal: theme.space[3], minHeight: 44, alignItems: "center", justifyContent: "center" },
  });
}
