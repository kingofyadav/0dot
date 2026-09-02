import { useLocalSearchParams } from "expo-router";
import { CoursesListBody } from "../../../src/screens/CoursesListBody";

export default function CoursesListScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return <CoursesListBody username={username} />;
}
