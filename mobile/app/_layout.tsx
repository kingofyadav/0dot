import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "../src/auth/AuthContext";
import { SignInScreen } from "../src/screens/SignInScreen";
import { LockScreen } from "../src/screens/LockScreen";
import { OnboardingScreen } from "../src/screens/OnboardingScreen";
import { subscribeToIncomingLinks } from "../src/links/universalLinks";
import { subscribeToPushNavigation } from "../src/push/pushNavigation";
import { hasSeenOnboarding, markOnboardingSeen } from "../src/utils/onboarding";
import { useTheme } from "../src/theme";

function RootNavigator() {
  const { status } = useAuth();
  const theme = useTheme();

  // Onboarding only ever makes sense ahead of sign-in, so it's read once
  // per cold start rather than gating every render — null means "haven't
  // checked storage yet," kept in the same loading state as auth status
  // below so there's no flash of the sign-in screen before this resolves.
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);
  useEffect(() => {
    hasSeenOnboarding().then(setOnboardingSeen);
  }, []);

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

  if (status === "loading" || onboardingSeen === null) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }
  if (status === "locked") return <LockScreen />;
  if (status === "signedOut") {
    if (!onboardingSeen) {
      return (
        <OnboardingScreen
          onDone={() => {
            markOnboardingSeen();
            setOnboardingSeen(true);
          }}
        />
      );
    }
    return <SignInScreen />;
  }

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
