import * as Sentry from "@sentry/react-native";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "../src/auth/AuthContext";
import { MessagesStreamProvider } from "../src/realtime/MessagesStreamContext";
import { UnreadBadgeProvider } from "../src/realtime/UnreadBadgeContext";
import { ThemePreferencesProvider } from "../src/themePreferences";
import { SignInScreen } from "../src/screens/SignInScreen";
import { LockScreen } from "../src/screens/LockScreen";
import { OnboardingScreen } from "../src/screens/OnboardingScreen";
import { subscribeToIncomingLinks } from "../src/links/universalLinks";
import { subscribeToPushNavigation } from "../src/push/pushNavigation";
import { hasSeenOnboarding, markOnboardingSeen } from "../src/utils/onboarding";
import { useTheme } from "../src/theme";
import { SENTRY_DSN } from "../src/config";

// M8 (mobile pro-upgrade addendum §6): no DSN means no project has been
// provisioned yet at sentry.io — init() is a documented no-op without one,
// so this line is safe to ship ahead of that provisioning step rather than
// gating the whole import on it.
if (SENTRY_DSN) {
  Sentry.init({ dsn: SENTRY_DSN });
}

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
      <Stack.Screen name="[username]/followers" options={{ title: "Followers" }} />
      <Stack.Screen name="[username]/following" options={{ title: "Following" }} />
      <Stack.Screen name="[username]/resume" options={{ title: "Résumé" }} />
      <Stack.Screen name="[username]/articles/index" options={{ title: "Articles" }} />
      <Stack.Screen name="[username]/articles/[slug]" options={{ title: "Article" }} />
      <Stack.Screen name="[username]/wiki/index" options={{ title: "Wiki" }} />
      <Stack.Screen name="[username]/wiki/[slug]" options={{ title: "Wiki page" }} />
      <Stack.Screen name="[username]/books/index" options={{ title: "Books" }} />
      <Stack.Screen name="[username]/books/[slug]/index" options={{ title: "Book" }} />
      <Stack.Screen name="[username]/books/[slug]/[chapterSlug]" options={{ title: "Chapter" }} />
      <Stack.Screen name="[username]/courses/index" options={{ title: "Courses" }} />
      <Stack.Screen name="[username]/courses/[courseId]" options={{ title: "Course" }} />
      <Stack.Screen name="compose" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="edit-profile" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="notification-preferences" options={{ title: "Notifications" }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
      <Stack.Screen name="bookmarks" options={{ title: "Bookmarks" }} />
      <Stack.Screen name="privacy-settings" options={{ title: "Privacy" }} />
      <Stack.Screen name="blocked-users" options={{ title: "Blocked users" }} />
      <Stack.Screen name="change-password" options={{ title: "Change password" }} />
      <Stack.Screen name="two-factor" options={{ title: "Two-factor authentication" }} />
      <Stack.Screen name="sessions" options={{ title: "Active sessions" }} />
      <Stack.Screen name="contact-settings" options={{ title: "Email & phone" }} />
      <Stack.Screen name="account-management" options={{ title: "Account management" }} />
      <Stack.Screen name="preferences" options={{ title: "Language & accessibility" }} />
      <Stack.Screen name="messages/[id]" options={{ title: "Conversation" }} />
      <Stack.Screen name="messages/new" options={{ title: "New message", presentation: "modal" }} />
      <Stack.Screen name="communities" options={{ title: "Communities" }} />
      <Stack.Screen name="community/[slug]" options={{ title: "Community" }} />
      <Stack.Screen name="businesses" options={{ title: "Businesses" }} />
      <Stack.Screen name="business/[slug]" options={{ title: "Business" }} />
      <Stack.Screen name="marketplace" options={{ title: "Marketplace" }} />
      <Stack.Screen name="events" options={{ title: "Events" }} />
      <Stack.Screen name="event/[slug]" options={{ title: "Event" }} />
      <Stack.Screen name="live/[livestreamId]" options={{ title: "Live", headerStyle: { backgroundColor: "#000" }, headerTintColor: "#fff" }} />
      <Stack.Screen name="wallet" options={{ title: "Wallet" }} />
      <Stack.Screen name="wallet/transactions" options={{ title: "Activity" }} />
      <Stack.Screen name="wallet/referral" options={{ title: "Invite & earn" }} />
    </Stack>
  );
}

function RootLayout() {
  return (
    // M9: required at the app root for react-native-gesture-handler's
    // gestures (BottomSheet's drag-to-dismiss, ConversationRow's swipe) to
    // receive touches at all — without it those gesture handlers silently
    // never fire.
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <AuthProvider>
          <ThemePreferencesProvider>
            <MessagesStreamProvider>
              <UnreadBadgeProvider>
                <RootNavigator />
                <StatusBar style="auto" />
              </UnreadBadgeProvider>
            </MessagesStreamProvider>
          </ThemePreferencesProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap is a no-op passthrough when init() above never ran (no DSN)
// — it only adds its error-boundary/breadcrumb instrumentation once a real
// project is configured.
export default Sentry.wrap(RootLayout);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
