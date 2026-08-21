import { View } from "react-native";
import { useAuth } from "../../src/auth/AuthContext";
import { ProfileScreenBody } from "../../src/screens/ProfileScreenBody";
import { useTheme } from "../../src/theme";

// The signed-in user's own profile, as a tab — replaces the old Settings
// tab (Settings is now a gear icon here, pushed as its own screen) to free
// up a tab slot for Messages/Explore, matching how X/Threads/Instagram all
// put the user's own profile in the tab bar rather than a settings icon.
export default function ProfileTabScreen() {
  const { me } = useAuth();
  const theme = useTheme();

  if (!me?.username) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  }

  return <ProfileScreenBody username={me.username} showSettingsShortcut />;
}
