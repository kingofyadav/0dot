import { useLocalSearchParams } from "expo-router";
import { BookDetailBody } from "../../../../src/screens/BookDetailBody";

export default function BookDetailScreen() {
  const { username, slug } = useLocalSearchParams<{ username: string; slug: string }>();
  return <BookDetailBody username={username} slug={slug} />;
}
