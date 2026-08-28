import { Stack, useLocalSearchParams } from "expo-router";
import { CommunityChatBody } from "../../../src/screens/CommunityChatBody";

export default function CommunityChatScreen() {
  const { slug, name } = useLocalSearchParams<{ slug: string; name?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: name ? `${name} · Chat` : "Chat" }} />
      <CommunityChatBody slug={slug} communityName={name} />
    </>
  );
}
