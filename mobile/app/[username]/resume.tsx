import { useLocalSearchParams } from "expo-router";
import { ResumeBody } from "../../src/screens/ResumeBody";

export default function ResumeScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return <ResumeBody username={username} />;
}
