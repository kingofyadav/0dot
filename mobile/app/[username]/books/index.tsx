import { useLocalSearchParams } from "expo-router";
import { BooksListBody } from "../../../src/screens/BooksListBody";

export default function BooksListScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return <BooksListBody username={username} />;
}
