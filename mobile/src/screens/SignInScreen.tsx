import { Button, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useAuth } from "../auth/AuthContext";

export function SignInScreen() {
  const { error, signIn } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>0dot</Text>
      <Button title="Sign in with 0dot" onPress={signIn} />
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
