import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { getMe, updateProfile, ApiError, type LocalImage } from "../src/api/client";
import { pickImage } from "../src/utils/pickImage";
import { haptics } from "../src/utils/haptics";
import { useTheme, type Theme } from "../src/theme";

const MAX_BIO_LENGTH = 280;

export default function EditProfileScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [newAvatar, setNewAvatar] = useState<LocalImage | null>(null);
  const [newCover, setNewCover] = useState<LocalImage | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        setDisplayName(me.displayName ?? "");
        setBio(me.bio ?? "");
        setAvatarUrl(me.avatarUrl);
        setCoverUrl(me.coverUrl);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load your profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onPickAvatar() {
    const image = await pickImage({ aspect: [1, 1] });
    if (image) {
      haptics.light();
      setNewAvatar(image);
    }
  }

  async function onPickCover() {
    const image = await pickImage({ aspect: [3, 1] });
    if (image) {
      haptics.light();
      setNewCover(image);
    }
  }

  const canSave = displayName.trim().length > 0 && displayName.length <= 50 && bio.length <= MAX_BIO_LENGTH && !saving;

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        avatar: newAvatar ?? undefined,
        cover: newCover ?? undefined,
      });
      haptics.light();
      router.back();
    } catch (err) {
      haptics.warning();
      setError(err instanceof ApiError ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  function onCancel() {
    haptics.light();
    router.back();
  }

  const displayedCoverUri = newCover?.uri ?? coverUrl ?? null;
  const displayedAvatarUri = newAvatar?.uri ?? avatarUrl ?? null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <View style={styles.topBar}>
          <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel" style={styles.topBarButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>Edit profile</Text>
          <Pressable
            onPress={onSave}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityLabel="Save"
            style={({ pressed }) => [styles.saveButton, !canSave && styles.saveButtonDisabled, { opacity: pressed ? 0.8 : 1 }]}
          >
            {saving ? (
              <ActivityIndicator size="small" color={theme.colors.onAccent} />
            ) : (
              <Text style={[styles.saveButtonText, !canSave && styles.saveButtonTextDisabled]}>Save</Text>
            )}
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Pressable onPress={onPickCover} accessibilityRole="button" accessibilityLabel="Change cover photo">
              {displayedCoverUri ? (
                <Image source={{ uri: displayedCoverUri }} style={styles.cover} contentFit="cover" />
              ) : (
                <View style={[styles.cover, styles.coverPlaceholder]} />
              )}
              <View style={styles.coverEditBadge}>
                <Ionicons name="camera" size={16} color={theme.colors.onAccent} />
              </View>
            </Pressable>

            <Pressable onPress={onPickAvatar} accessibilityRole="button" accessibilityLabel="Change avatar" style={styles.avatarWrap}>
              {displayedAvatarUri ? (
                <Image source={{ uri: displayedAvatarUri }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]} />
              )}
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera" size={14} color={theme.colors.onAccent} />
              </View>
            </Pressable>

            <View style={styles.field}>
              <Text style={styles.label}>Display name</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                maxLength={50}
                accessibilityLabel="Display name"
              />
            </View>

            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Bio</Text>
                <Text style={styles.counter}>
                  {bio.length}/{MAX_BIO_LENGTH}
                </Text>
              </View>
              <TextInput
                style={[styles.input, styles.bioInput]}
                value={bio}
                onChangeText={setBio}
                multiline
                maxLength={MAX_BIO_LENGTH}
                accessibilityLabel="Bio"
              />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </ScrollView>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.colors.background },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
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
    title: { fontWeight: theme.weight.emphasis, fontSize: theme.text.base, color: theme.colors.foreground },
    saveButton: {
      minHeight: 36,
      minWidth: 64,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.accent,
      paddingHorizontal: theme.space[4],
    },
    saveButtonDisabled: { backgroundColor: theme.colors.border },
    saveButtonText: { color: theme.colors.onAccent, fontWeight: theme.weight.emphasis, fontSize: theme.text.sm },
    saveButtonTextDisabled: { color: theme.colors.mutedForeground },
    scrollContent: { paddingBottom: theme.space[8] },
    cover: { width: "100%", height: 140 },
    coverPlaceholder: { backgroundColor: theme.colors.surface },
    coverEditBadge: {
      position: "absolute",
      right: theme.space[3],
      bottom: theme.space[3],
      width: 32,
      height: 32,
      borderRadius: theme.radius.full,
      backgroundColor: "rgba(0,0,0,0.6)",
      alignItems: "center",
      justifyContent: "center",
    },
    avatarWrap: { marginTop: -36, marginLeft: theme.space[4], width: 72, height: 72 },
    avatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: theme.colors.background },
    avatarPlaceholder: { backgroundColor: theme.colors.surface },
    avatarEditBadge: {
      position: "absolute",
      right: -2,
      bottom: -2,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: theme.colors.accent,
      borderWidth: 2,
      borderColor: theme.colors.background,
      alignItems: "center",
      justifyContent: "center",
    },
    field: { paddingHorizontal: theme.space[4], marginTop: theme.space[5], gap: theme.space[2] },
    labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    label: { fontSize: theme.text.sm, fontWeight: theme.weight.label, color: theme.colors.mutedForeground },
    counter: { fontSize: theme.text.xs, color: theme.colors.mutedForeground },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.surface,
      color: theme.colors.foreground,
      fontSize: theme.text.base,
      paddingHorizontal: theme.space[3],
      paddingVertical: theme.space[3],
      minHeight: 44,
    },
    bioInput: { minHeight: 88, textAlignVertical: "top" },
    errorText: { color: theme.colors.danger, fontSize: theme.text.sm, paddingHorizontal: theme.space[4], marginTop: theme.space[3] },
  });
}
