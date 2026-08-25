import { useLocalSearchParams } from "expo-router";
import { FollowListScreen } from "../../src/screens/FollowListScreen";

export default function FollowersScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return <FollowListScreen username={username} mode="followers" />;
}
