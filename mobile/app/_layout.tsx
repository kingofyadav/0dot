import { Stack } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AuthProvider, useAuth } from "../src/auth/AuthContext";
import { SignInScreen } from "../src/screens/SignInScreen";
import { LockScreen } from "../src/screens/LockScreen";
import { subscribeToIncomingLinks } from "../src/links/universalLinks";
import { subscribeToPushNavigation } from "../src/push/pushNavigation";

function RootNavigator() {
  const { status } = useAuth();

  // Registered once, regardless of auth state, matching the original
  // App.tsx's unconditional subscribeToIncomingLinks(setOpenedVia) call —
  // both listeners are cheap no-ops until an actual link/push tap arrives.
  useEffect(() => {
    const unsubscribeLinks = subscribeToIncomingLinks();
    const unsubscribePush = subscribeToPushNavigation();
    return () => {
      unsubscribeLinks();
      unsubscribePush();
    };
  }, []);

  if (status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (status === "locked") return <LockScreen />;
  if (status === "signedOut") return <SignInScreen />;

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="post/[id]" options={{ title: "Post" }} />
      <Stack.Screen name="[username]" options={{ title: "Profile" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
