import { useLocalSearchParams } from "expo-router";
import { WikiListBody } from "../../../src/screens/WikiListBody";

export default function WikiListScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return <WikiListBody username={username} />;
}
