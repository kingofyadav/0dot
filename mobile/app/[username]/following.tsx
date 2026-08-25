import { useLocalSearchParams } from "expo-router";
import { FollowListScreen } from "../../src/screens/FollowListScreen";

export default function FollowingScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return <FollowListScreen username={username} mode="following" />;
}
