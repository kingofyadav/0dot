import { useLocalSearchParams } from "expo-router";
import { LivestreamViewerBody } from "../../src/screens/LivestreamViewerBody";

export default function LivestreamScreen() {
  const { livestreamId } = useLocalSearchParams<{ livestreamId: string }>();
  return <LivestreamViewerBody livestreamId={livestreamId} />;
}
