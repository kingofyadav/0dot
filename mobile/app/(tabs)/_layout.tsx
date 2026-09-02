import { Tabs } from "expo-router";
import { Platform, StyleSheet, Text, View, type ColorValue } from "react-native";
import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme, type Theme } from "../../src/theme";
import { useUnreadBadges } from "../../src/realtime/UnreadBadgeContext";

// Mobile pro-upgrade addendum, sub-phase M13 — a small absolutely-
// positioned count over the tab icon. Ionicons has no built-in badge
// slot, so this wraps the icon in a plain View rather than reaching for a
// third-party badge component for one small overlay. Danger (not accent)
// — theme.ts's own Google-4-color comment reserves Red for status, never
// decorative, and an unread count is exactly a status signal.
function TabIcon({
  name,
  color,
  size,
  count,
  theme,
}: {
  name: keyof typeof Ionicons.glyphMap;
  color: ColorValue;
  size: number;
  count: number;
  theme: Theme;
}) {
  const styles = createIconStyles(theme);
  return (
    <View>
      <Ionicons name={name} size={size} color={color} />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText} numberOfLines={1}>
            {count > 9 ? "9+" : count}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function TabsLayout() {
  const theme = useTheme();
  const { messages, notifications } = useUnreadBadges();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTitleStyle: { fontWeight: theme.weight.emphasis, color: theme.colors.foreground },
        headerTintColor: theme.colors.foreground,
        // M15/D2: the tab bar becomes translucent glass — absolutely
        // positioned so screen content scrolls *under* it (that's what the
        // blur has to sample), a transparent own-background so only the
        // tabBarBackground paints, and the stronger on-glass hairline for
        // its top edge. The 5 tab-root screens each add a matching bottom
        // inset (useTabBarContentPadding) so nothing ends up trapped behind
        // it.
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "transparent",
          borderTopColor: theme.glass.hairlineOnGlass,
        },
        // expo-blur only produces a real blur on iOS — on Android it falls
        // back to a thin translucent tint, which over a `transparent` bar
        // left feed content clearly legible *through* the tab labels. So
        // iOS gets the genuine frosted-glass material; Android gets a
        // solid themed surface (the same treatment as the platform's own
        // Material nav bars), so the bar is always fully opaque there.
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView
              tint={theme.glass.chromeTint}
              intensity={theme.glass.chromeIntensity}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.surface }]} />
          ),
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.mutedForeground,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "search" : "search-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? "chatbubbles" : "chatbubbles-outline"} color={color} size={size} count={messages} theme={theme} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Notifications",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name={focused ? "notifications" : "notifications-outline"}
              color={color}
              size={size}
              count={notifications}
              theme={theme}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "person-circle" : "person-circle-outline"} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

function createIconStyles(theme: Theme) {
  return StyleSheet.create({
    badge: {
      position: "absolute",
      top: -4,
      right: -8,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 3,
      backgroundColor: theme.colors.danger,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: theme.colors.surface,
    },
    badgeText: { color: theme.colors.onDanger, fontSize: 10, fontWeight: theme.weight.emphasis },
  });
}
