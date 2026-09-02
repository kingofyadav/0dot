import { useLocalSearchParams } from "expo-router";
import { BookChapterBody } from "../../../../src/screens/BookChapterBody";

export default function BookChapterScreen() {
  const { username, slug, chapterSlug } = useLocalSearchParams<{ username: string; slug: string; chapterSlug: string }>();
  return <BookChapterBody username={username} slug={slug} chapterSlug={chapterSlug} />;
}
