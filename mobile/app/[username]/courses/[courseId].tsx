import { useLocalSearchParams } from "expo-router";
import { CourseDetailBody } from "../../../src/screens/CourseDetailBody";

export default function CourseDetailScreen() {
  const { username, courseId } = useLocalSearchParams<{ username: string; courseId: string }>();
  return <CourseDetailBody username={username} courseId={courseId} />;
}
