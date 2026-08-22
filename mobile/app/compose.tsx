import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { createPost, ApiError, type LocalImage } from "../src/api/client";
import { pickImage } from "../src/utils/pickImage";
import { haptics } from "../src/utils/haptics";
import { useTheme, type Theme } from "../src/theme";

const MAX_LENGTH = 500;
// Matches web's compose warning threshold posture (getting close to the
// limit is worth flagging before the hard stop at MAX_LENGTH).
const WARN_THRESHOLD = 40;
// Mirrors MAX_MEDIA_PER_POST server-side (posts/route.ts).
const MAX_IMAGES = 4;

export default function ComposeScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [body, setBody] = useState("");
  const [images, setImages] = useState<LocalImage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = MAX_LENGTH - body.length;
  // A body-less post is only valid when an image makes up for it — same
  // rule the server enforces (POST /api/v1/posts).
  const canPost = (body.trim().length > 0 || images.length > 0) && !sending;

  async function onAddImage() {
    if (images.length >= MAX_IMAGES) return;
    const image = await pickImage();
    if (image) {
      haptics.light();
      setImages((prev) => [...prev, image]);
    }
  }

  function onRemoveImage(index: number) {
    haptics.light();
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function onPost() {
    const trimmed = body.trim();
    if ((!trimmed && images.length === 0) || sending) return;
    setSending(true);
    setError(null);
    try {
      await createPost({ body: trimmed, media: images });
      haptics.light();
      router.back();
    } catch (err) {
      haptics.warning();
      setError(err instanceof ApiError ? err.message : "Could not post.");
    } finally {
      setSending(false);
    }
  }

  function onCancel() {
    haptics.light();
    router.back();
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <View style={styles.topBar}>
          <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel" style={styles.topBarButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onPost}
            disabled={!canPost}
            accessibilityRole="button"
            accessibilityLabel="Post"
            style={({ pressed }) => [styles.postButton, !canPost && styles.postButtonDisabled, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={[styles.postButtonText, !canPost && styles.postButtonTextDisabled]}>Post</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.input}
          placeholder="What's on your mind?"
          placeholderTextColor={theme.colors.mutedForeground}
          value={body}
          onChangeText={setBody}
          multiline
          autoFocus
          maxLength={MAX_LENGTH}
          accessibilityLabel="Post text"
        />

        {images.length > 0 ? (
          <ScrollView horizontal style={styles.imageRow} contentContainerStyle={styles.imageRowContent}>
            {images.map((image, index) => (
              <View key={image.uri} style={styles.imageThumbWrap}>
                <Image source={{ uri: image.uri }} style={styles.imageThumb} contentFit="cover" alt={`Selected image ${index + 1}`} />
                <Pressable
                  onPress={() => onRemoveImage(index)}
                  accessibilityRole="button"
                  accessibilityLabel="Remove image"
                  hitSlop={8}
                  style={styles.imageRemoveButton}
                >
                  <Ionicons name="close" size={14} color={theme.colors.onAccent} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.footer}>
          <Pressable
            onPress={onAddImage}
            disabled={images.length >= MAX_IMAGES}
            accessibilityRole="button"
            accessibilityLabel="Add photo"
            hitSlop={8}
            style={[styles.addImageButton, images.length >= MAX_IMAGES && { opacity: 0.4 }]}
          >
            <Ionicons name="image-outline" size={22} color={theme.colors.accent} />
          </Pressable>
          {error ? <Text style={styles.errorText}>{error}</Text> : <View style={styles.flex1} />}
          <Text style={[styles.counter, remaining <= WARN_THRESHOLD && { color: theme.colors.warning }]}>{remaining}</Text>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.colors.background },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.space[4],
      paddingVertical: theme.space[3],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    topBarButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: theme.space[2] },
    cancelText: { color: theme.colors.mutedForeground, fontSize: theme.text.base },
    postButton: {
      minHeight: 36,
      minWidth: 72,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.accent,
      paddingHorizontal: theme.space[4],
    },
    postButtonDisabled: { backgroundColor: theme.colors.border },
    postButtonText: { color: theme.colors.onAccent, fontWeight: theme.weight.emphasis, fontSize: theme.text.sm },
    postButtonTextDisabled: { color: theme.colors.mutedForeground },
    input: {
      flex: 1,
      padding: theme.space[4],
      fontSize: theme.text.lg,
      lineHeight: theme.text.lg * 1.4,
      color: theme.colors.foreground,
      textAlignVertical: "top",
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.space[3],
      paddingHorizontal: theme.space[4],
      paddingBottom: theme.space[3],
    },
    flex1: { flex: 1 },
    addImageButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
    errorText: { color: theme.colors.danger, fontSize: theme.text.sm, flex: 1 },
    counter: { color: theme.colors.mutedForeground, fontSize: theme.text.xs },
    imageRow: { maxHeight: 96, paddingHorizontal: theme.space[4] },
    imageRowContent: { gap: theme.space[2] },
    imageThumbWrap: { width: 84, height: 84, borderRadius: theme.radius.md, overflow: "hidden" },
    imageThumb: { width: "100%", height: "100%" },
    imageRemoveButton: {
      position: "absolute",
      top: 4,
      right: 4,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "rgba(0,0,0,0.6)",
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
