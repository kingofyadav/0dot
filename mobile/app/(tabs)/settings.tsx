import { Button, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/auth/AuthContext";

export default function SettingsScreen() {
  const { me, tokens, error, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{me ? `Hi, ${me.displayName ?? me.username ?? "there"}` : "Signed in to 0dot"}</Text>
      {me?.username ? <Text style={styles.mutedText}>@{me.username}</Text> : null}
      {tokens ? <Text style={styles.mutedText}>Access token expires {new Date(tokens.expiresAt).toLocaleTimeString()}</Text> : null}
      <Button title="Sign out" onPress={signOut} />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  title: { fontSize: 20, fontWeight: "600" },
  mutedText: { color: "#666" },
  errorText: { color: "#c00", textAlign: "center" },
});
