import { Modal, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = {
  uri: string | null;
  onClose: () => void;
};

// A full-screen viewer for an avatar/cover tap — the "pro" pattern every
// major social app has (X, Instagram) for a photo that's otherwise only
// ever seen small and cropped. `uri: null` means closed, rather than a
// separate `visible` boolean, since there's never a meaningful "open with
// no image" state here. Modal's own built-in fade handles the transition
// — unlike BottomSheet, this isn't opened/closed often enough per session
// to be worth a Reanimated gesture investment of its own.
export function ImageLightbox({ uri, onClose }: Props) {
  return (
    <Modal visible={uri !== null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close image">
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
          {uri ? <Image source={{ uri }} style={styles.image} contentFit="contain" /> : null}
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.92)" },
  safeArea: { flex: 1 },
  image: { flex: 1 },
});
