import { useLocalSearchParams } from "expo-router";
import { ArticlesListBody } from "../../../src/screens/ArticlesListBody";

export default function ArticlesListScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return <ArticlesListBody username={username} />;
}
