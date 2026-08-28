import { Stack, useLocalSearchParams } from "expo-router";
import { VoiceRoomBody } from "../../../../src/screens/VoiceRoomBody";

export default function VoiceRoomScreen() {
  const { slug, roomId, title } = useLocalSearchParams<{ slug: string; roomId: string; title?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: title ?? "Voice room" }} />
      <VoiceRoomBody slug={slug} roomId={roomId} />
    </>
  );
}
