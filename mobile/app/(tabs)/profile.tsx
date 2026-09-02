import { View } from "react-native";
import { useAuth } from "../../src/auth/AuthContext";
import { EmptyState } from "../../src/components/EmptyState";
import { SkeletonBlock } from "../../src/components/Skeleton";
import { ProfileScreenBody } from "../../src/screens/ProfileScreenBody";
import { useTabBarContentPadding } from "../../src/utils/useTabBarInset";
import { useTheme } from "../../src/theme";

// The signed-in user's own profile, as a tab — replaces the old Settings
// tab (Settings is now a gear icon here, pushed as its own screen) to free
// up a tab slot for Messages/Explore, matching how X/Threads/Instagram all
// put the user's own profile in the tab bar rather than a settings icon.
export default function ProfileTabScreen() {
  const { me, error, refreshMe } = useAuth();
  const theme = useTheme();
  // M15/D4: the glass tab bar overlays this screen's post list here (but
  // not on app/[username].tsx, where the same body is pushed on the stack).
  const { paddingBottom } = useTabBarContentPadding();

  // `me` can be null here even while signed in — `status` flips to
  // "signedIn" the moment tokens restore, before (or without) `getMe()`
  // resolving. Rather than a blank black screen: a shaped skeleton while
  // it's still loading, and a retry affordance if it actually failed
  // (AuthContext is already auto-retrying in the background too).
  if (!me?.username) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingBottom }}>
        {error ? (
          <EmptyState
            icon="person-outline"
            message="Couldn't load your profile"
            description={error}
            onRetry={refreshMe}
          />
        ) : (
          <View style={{ alignItems: "center", paddingTop: theme.space[12], gap: theme.space[3] }}>
            <SkeletonBlock width={88} height={88} radius={44} />
            <SkeletonBlock width={180} height={20} />
            <SkeletonBlock width={120} height={14} />
          </View>
        )}
      </View>
    );
  }

  return <ProfileScreenBody username={me.username} showSettingsShortcut bottomInset={paddingBottom} />;
}
