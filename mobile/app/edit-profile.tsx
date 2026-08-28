import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { getMe, updateProfile, ApiError, type LocalImage } from "../src/api/client";
import { Avatar } from "../src/components/Avatar";
import { DEFAULT_COVER_SOURCE } from "../src/components/defaultCover";
import { BottomSheet } from "../src/components/BottomSheet";
import { THEME_PRESET_OPTIONS } from "../src/utils/themePresets";
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
  const [isPrivate, setIsPrivate] = useState(false);
  const [themePreset, setThemePreset] = useState("default");
  const [isPremium, setIsPremium] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Snapshot of what was actually loaded, captured once — compared against
  // current field state to gate Save/discard-confirm on a real diff rather
  // than "the screen is open," which used to let a stray tap fire a no-op
  // update or silently drop an in-progress edit on Cancel. A real (state)
  // value, not a ref: this is read during render to compute `isDirty`
  // below, and react-hooks/refs flags reading `ref.current` there — refs
  // are for values render doesn't need, which this one is.
  const [initialSnapshot, setInitialSnapshot] = useState<{
    displayName: string;
    bio: string;
    isPrivate: boolean;
    themePreset: string;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        setDisplayName(me.displayName ?? "");
        setBio(me.bio ?? "");
        setAvatarUrl(me.avatarUrl);
        setCoverUrl(me.coverUrl);
        setIsPrivate(me.isPrivate);
        setThemePreset(me.themePreset ?? "default");
        setIsPremium(me.isPremium);
        setInitialSnapshot({
          displayName: me.displayName ?? "",
          bio: me.bio ?? "",
          isPrivate: me.isPrivate,
          themePreset: me.themePreset ?? "default",
        });
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

  const isDirty = initialSnapshot
    ? displayName !== initialSnapshot.displayName ||
      bio !== initialSnapshot.bio ||
      isPrivate !== initialSnapshot.isPrivate ||
      themePreset !== initialSnapshot.themePreset ||
      newAvatar !== null ||
      newCover !== null
    : false;

  const canSave = isDirty && displayName.trim().length > 0 && displayName.length <= 50 && bio.length <= MAX_BIO_LENGTH && !saving;

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        isPrivate,
        themePreset,
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
    if (!isDirty) {
      haptics.light();
      router.back();
      return;
    }
    haptics.light();
    Alert.alert("Discard changes?", "Your edits will be lost.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  }

  const displayedCoverUri = newCover?.uri ?? coverUrl ?? null;
  const displayedAvatarUri = newAvatar?.uri ?? avatarUrl ?? null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
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
              <Image
                source={displayedCoverUri ? { uri: displayedCoverUri } : DEFAULT_COVER_SOURCE}
                style={styles.cover}
                contentFit="cover"
                accessible
                alt="Cover photo"
              />
              <View style={styles.coverEditBadge}>
                <Ionicons name="camera" size={16} color={theme.colors.onAccent} />
              </View>
            </Pressable>

            <Pressable onPress={onPickAvatar} accessibilityRole="button" accessibilityLabel="Change avatar" style={styles.avatarWrap}>
              <View style={styles.avatarBorder}>
                <Avatar uri={displayedAvatarUri} name={displayName} size={66} />
              </View>
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

            <View style={styles.field}>
              <Text style={styles.label}>Theme</Text>
              <Pressable
                onPress={() => {
                  haptics.light();
                  setThemePickerOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Choose theme"
                style={styles.themeRow}
              >
                <View style={[styles.themeSwatch, { backgroundColor: THEME_PRESET_OPTIONS.find((p) => p.key === themePreset)?.accent ?? theme.colors.accent }]} />
                <Text style={styles.themeRowLabel}>{THEME_PRESET_OPTIONS.find((p) => p.key === themePreset)?.label ?? "Classic"}</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.mutedForeground} />
              </Pressable>
              {!isPremium && (
                <Text style={styles.hint}>
                  Premium unlocks {THEME_PRESET_OPTIONS.filter((p) => p.premiumOnly).length} additional theme presets.
                </Text>
              )}
            </View>

            <View style={styles.field}>
              <View style={styles.privacyRow}>
                <View style={styles.privacyText}>
                  <Text style={styles.label}>Private profile</Text>
                  <Text style={styles.hint}>
                    When private, only your name, avatar, and bio are visible to people who don&apos;t follow you — your posts stay
                    hidden until they follow you.
                  </Text>
                </View>
                <Switch
                  value={isPrivate}
                  onValueChange={setIsPrivate}
                  trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                  thumbColor={theme.colors.surface}
                  accessibilityLabel="Private profile"
                />
              </View>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </ScrollView>
        )}
      </SafeAreaView>

      <BottomSheet visible={themePickerOpen} onClose={() => setThemePickerOpen(false)} title="Theme">
        {THEME_PRESET_OPTIONS.map((preset) => {
          const locked = preset.premiumOnly && !isPremium && preset.key !== themePreset;
          return (
            <Pressable
              key={preset.key}
              disabled={locked}
              onPress={() => {
                haptics.light();
                setThemePreset(preset.key);
                setThemePickerOpen(false);
              }}
              accessibilityRole="button"
              accessibilityLabel={preset.label}
              style={[styles.themeOptionRow, locked && { opacity: 0.4 }]}
            >
              <View style={[styles.themeSwatch, { backgroundColor: preset.accent }]} />
              <Text style={styles.themeRowLabel}>
                {preset.label}
                {preset.premiumOnly ? " (Premium)" : ""}
              </Text>
              {preset.key === themePreset ? <Ionicons name="checkmark" size={18} color={theme.colors.accent} /> : null}
            </Pressable>
          );
        })}
      </BottomSheet>
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
    avatarBorder: {
      width: 72,
      height: 72,
      borderRadius: 36,
      borderWidth: 3,
      borderColor: theme.colors.background,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
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
      // Redesign Phase 5: readable input edge (--border-strong on web).
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.surface,
      color: theme.colors.foreground,
      fontSize: theme.text.base,
      paddingHorizontal: theme.space[3],
      paddingVertical: theme.space[3],
      minHeight: 44,
    },
    bioInput: { minHeight: 88, textAlignVertical: "top" },
    hint: { fontSize: theme.text.xs, color: theme.colors.mutedForeground, marginTop: theme.space[1] },
    themeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space[3],
      minHeight: 48,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: theme.space[3],
    },
    themeSwatch: { width: 20, height: 20, borderRadius: 10 },
    themeRowLabel: { flex: 1, color: theme.colors.foreground, fontSize: theme.text.base },
    themeOptionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space[3],
      minHeight: 48,
      paddingHorizontal: theme.space[2],
    },
    privacyRow: { flexDirection: "row", alignItems: "center", gap: theme.space[3] },
    privacyText: { flex: 1, gap: theme.space[1] },
    errorText: { color: theme.colors.danger, fontSize: theme.text.sm, paddingHorizontal: theme.space[4], marginTop: theme.space[3] },
  });
}
