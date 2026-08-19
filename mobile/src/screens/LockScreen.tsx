import { Button, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useAuth } from "../auth/AuthContext";

export function LockScreen() {
  const { error, unlock, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>0dot is locked</Text>
      <Button title="Unlock" onPress={unlock} />
      {/* Without this, a user whose biometrics stop working (broken sensor,
          no longer enrolled) would be permanently stuck here — a valid
          session they can neither access nor discard. */}
      <Button title="Sign out instead" onPress={signOut} />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  title: { fontSize: 20, fontWeight: "600" },
  errorText: { color: "#c00", textAlign: "center" },
});
