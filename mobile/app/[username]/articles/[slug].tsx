import { useLocalSearchParams } from "expo-router";
import { ArticleDetailBody } from "../../../src/screens/ArticleDetailBody";

export default function ArticleDetailScreen() {
  const { username, slug } = useLocalSearchParams<{ username: string; slug: string }>();
  return <ArticleDetailBody username={username} slug={slug} />;
}
