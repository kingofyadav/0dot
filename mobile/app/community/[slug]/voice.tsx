import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  getCommunityVoiceRooms,
  createVoiceRoom,
  ApiError,
} from "../../../src/api/client";
import { Button } from "../../../src/components/Button";
import { EmptyState } from "../../../src/components/EmptyState";
import { ListRow } from "../../../src/components/ListRow";
import { haptics } from "../../../src/utils/haptics";
import { useTheme, type Theme } from "../../../src/theme";
import type { VoiceRoomSummary } from "../../../src/api/types";

export default function CommunityVoiceScreen() {
  const { slug, name } = useLocalSearchParams<{ slug: string; name?: string }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [rooms, setRooms] = useState<VoiceRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await getCommunityVoiceRooms(slug);
      setRooms(result.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load voice rooms.");
    }
  }, [slug]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        await load();
        setLoading(false);
      })();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function onCreate() {
    if (!title.trim() || creating) return;
    setCreating(true);
    try {
      const { id } = await createVoiceRoom(slug, title.trim());
      setTitle("");
      haptics.light();
      router.push({ pathname: "/community/[slug]/voice/[roomId]", params: { slug, roomId: id, title: title.trim() } });
    } catch (err) {
      haptics.warning();
      setError(err instanceof ApiError ? err.message : "Could not start the room.");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: name ? `${name} · Voice` : "Voice rooms" }} />
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: name ? `${name} · Voice` : "Voice rooms" }} />
      <FlatList
        data={rooms}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
        ListHeaderComponent={
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              placeholder="Start a room…"
              placeholderTextColor={theme.colors.mutedForeground}
              value={title}
              onChangeText={setTitle}
              maxLength={120}
              accessibilityLabel="Room title"
            />
            <Button label="Start" onPress={onCreate} loading={creating} disabled={!title.trim()} style={styles.startButton} />
          </View>
        }
        ListEmptyComponent={<EmptyState icon="mic-outline" message={error ?? "No live rooms right now."} onRetry={error ? load : undefined} />}
        renderItem={({ item }) => (
          <ListRow
            accessibilityLabel={`Voice room ${item.title}`}
            onPress={() =>
              router.push({ pathname: "/community/[slug]/voice/[roomId]", params: { slug, roomId: item.id, title: item.title } })
            }
          >
            <Ionicons
              name={item.status === "live" ? "radio" : "time-outline"}
              size={22}
              color={item.status === "live" ? theme.colors.danger : theme.colors.mutedForeground}
            />
            <View style={styles.roomBody}>
              <Text style={styles.roomTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.roomMeta}>
                {item.status === "live" ? (item.floorFree ? "Live · floor free" : "Live · someone speaking") : "Scheduled"}
                {item.creatorName ? ` · by ${item.creatorName}` : ""}
              </Text>
            </View>
          </ListRow>
        )}
      />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    composer: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space[2],
      padding: theme.space[3],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    input: {
      flex: 1,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.space[3],
      paddingVertical: theme.space[2],
      fontSize: theme.text.base,
      color: theme.colors.foreground,
      backgroundColor: theme.colors.surface,
    },
    startButton: { minWidth: 72 },
    roomBody: { flex: 1, gap: 2 },
    roomTitle: { color: theme.colors.foreground, fontSize: theme.text.base, fontWeight: theme.weight.emphasis },
    roomMeta: { color: theme.colors.mutedForeground, fontSize: theme.text.xs },
  });
}
