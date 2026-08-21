import { useLocalSearchParams } from "expo-router";
import { ProfileScreenBody } from "../src/screens/ProfileScreenBody";

export default function ProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return <ProfileScreenBody username={username} />;
}
