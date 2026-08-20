import { Stack } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "../src/auth/AuthContext";
import { SignInScreen } from "../src/screens/SignInScreen";
import { LockScreen } from "../src/screens/LockScreen";
import { subscribeToIncomingLinks } from "../src/links/universalLinks";
import { subscribeToPushNavigation } from "../src/push/pushNavigation";
import { useTheme } from "../src/theme";

function RootNavigator() {
  const { status } = useAuth();
  const theme = useTheme();

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
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }
  if (status === "locked") return <LockScreen />;
  if (status === "signedOut") return <SignInScreen />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.foreground,
        headerTitleStyle: { fontWeight: theme.weight.emphasis },
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="post/[id]" options={{ title: "Post" }} />
      <Stack.Screen name="[username]" options={{ title: "Profile" }} />
      <Stack.Screen name="compose" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="edit-profile" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="notification-preferences" options={{ title: "Notifications" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
        <StatusBar style="auto" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
