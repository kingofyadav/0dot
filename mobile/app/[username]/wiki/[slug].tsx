import { useLocalSearchParams } from "expo-router";
import { WikiDetailBody } from "../../../src/screens/WikiDetailBody";

export default function WikiDetailScreen() {
  const { username, slug } = useLocalSearchParams<{ username: string; slug: string }>();
  return <WikiDetailBody username={username} slug={slug} />;
}
