import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, AppState, FlatList, StyleSheet, Text, View } from "react-native";
import { registerGlobals, AudioSession, LiveKitRoom, VideoTrack, useTracks } from "@livekit/react-native";
import { Track } from "livekit-client";
import { useAuth } from "../auth/AuthContext";
import { getLivestream, getLivestreamToken, getLivestreamChat, ApiError } from "../api/client";
import { createLivestreamChatStream } from "../realtime/livestreamChatStream";
import { Avatar } from "../components/Avatar";
import { EmptyState } from "../components/EmptyState";
import { relativeTime } from "../utils/relativeTime";
import { useTheme, type Theme } from "../theme";
import type { LivestreamDetail, LivestreamChatMessage, LiveKitToken } from "../api/types";

// react-native-webrtc's globals must be registered once, before any Room is
// constructed — same module-scope guard as VoiceRoomBody.tsx.
let globalsRegistered = false;
function ensureGlobals() {
  if (globalsRegistered) return;
  registerGlobals();
  globalsRegistered = true;
}

// The one video-consuming screen on mobile (voice rooms are audio-only) —
// unlike VoiceRoomBody's manual `new Room()` + `room.connect()`, this uses
// the <LiveKitRoom> wrapper + useTracks/VideoTrack, since track
// subscription bookkeeping (RoomEvent.TrackSubscribed etc.) is otherwise
// hand-rolled. audio/video props on <LiveKitRoom> control *local publish*
// (would make the viewer broadcast their own mic/camera) — left false/
// unset here since a viewer only ever subscribes, never publishes;
// subscribing to the broadcaster's remote tracks is independent of those
// props and already granted by the token's canSubscribe:true.
export function LivestreamViewerBody({ livestreamId }: { livestreamId: string }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { tokens } = useAuth();

  ensureGlobals();

  const [detail, setDetail] = useState<LivestreamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveKitToken, setLiveKitToken] = useState<LiveKitToken | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [messages, setMessages] = useState<LivestreamChatMessage[]>([]);
  const [chatCursor, setChatCursor] = useState<string | null>(null);
  const [loadingMoreChat, setLoadingMoreChat] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await getLivestream(livestreamId));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this livestream.");
    }
  }, [livestreamId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const isLive = detail?.status === "live" && detail.hasAccess;

  const loadChat = useCallback(async () => {
    try {
      const page = await getLivestreamChat(livestreamId);
      setMessages(page.items);
      setChatCursor(page.nextCursor);
    } catch {
      // Best-effort — the video is the primary content, chat failing to
      // load shouldn't block or error the whole screen.
    }
  }, [livestreamId]);

  useEffect(() => {
    if (!isLive) return;
    loadChat();
  }, [isLive, loadChat]);

  // Chat SSE — refetch the recent page on any signal (no payload/replay,
  // see livestreamChatStream.ts's comment).
  useEffect(() => {
    const accessToken = tokens?.accessToken;
    if (!accessToken || !isLive) return;
    const stream = createLivestreamChatStream({ livestreamId, accessToken, onEvent: () => loadChat() });
    stream.setActive(AppState.currentState === "active");
    const sub = AppState.addEventListener("change", (s) => stream.setActive(s === "active"));
    return () => {
      sub.remove();
      stream.close();
    };
  }, [livestreamId, tokens?.accessToken, isLive, loadChat]);

  // Audio session + the viewer's LiveKit token — mints a fresh token per
  // mount (tokens are short-lived, same posture as voice rooms).
  useEffect(() => {
    if (!isLive) return;
    let cancelled = false;
    let audioStarted = false;

    (async () => {
      try {
        await AudioSession.startAudioSession();
        audioStarted = true;
        const result = await getLivestreamToken(livestreamId);
        if (!cancelled) {
          setLiveKitToken(result);
          setTokenError(null);
        }
      } catch (err) {
        if (!cancelled) setTokenError(err instanceof ApiError ? err.message : "Couldn't connect to the stream.");
      }
    })();

    return () => {
      cancelled = true;
      setLiveKitToken(null);
      if (audioStarted) void AudioSession.stopAudioSession();
    };
  }, [isLive, livestreamId]);

  async function onLoadMoreChat() {
    if (!chatCursor || loadingMoreChat) return;
    setLoadingMoreChat(true);
    try {
      const page = await getLivestreamChat(livestreamId, chatCursor);
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        return [...prev, ...page.items.filter((m) => !known.has(m.id))];
      });
      setChatCursor(page.nextCursor);
    } catch {
      // Best-effort.
    } finally {
      setLoadingMoreChat(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }
  if (!detail) {
    return (
      <View style={styles.center}>
        <EmptyState icon="videocam-off-outline" message={error ?? "Livestream not found."} onRetry={error ? load : undefined} />
      </View>
    );
  }
  if (!detail.hasAccess) {
    return (
      <View style={styles.center}>
        <EmptyState icon="lock-closed-outline" message="You don't have access to this livestream." />
      </View>
    );
  }
  if (detail.status !== "live") {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="videocam-off-outline"
          message={detail.status === "ended" ? "This livestream has ended." : "This livestream hasn't started yet."}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.videoArea}>
        {liveKitToken ? (
          <LiveKitRoom serverUrl={liveKitToken.url} token={liveKitToken.token} connect audio={false} video={false} onError={() => setTokenError("Connection lost.")}>
            <RemoteVideo />
          </LiveKitRoom>
        ) : (
          <View style={styles.videoPlaceholder}>
            {tokenError ? (
              <Text style={styles.videoPlaceholderText}>{tokenError}</Text>
            ) : (
              <ActivityIndicator color={theme.colors.background} />
            )}
          </View>
        )}
      </View>

      <View style={styles.streamerRow}>
        <Avatar uri={detail.creator.avatarUrl} name={detail.creator.displayName ?? detail.creator.username} size={32} />
        <View style={styles.streamerText}>
          <Text style={styles.title} numberOfLines={1}>
            {detail.title}
          </Text>
          <Text style={styles.creatorName} numberOfLines={1}>
            {detail.creator.displayName ?? (detail.creator.username ? `@${detail.creator.username}` : "Unknown")}
          </Text>
        </View>
      </View>

      <FlatList
        style={styles.chatList}
        contentContainerStyle={styles.chatContent}
        data={messages}
        keyExtractor={(m) => m.id}
        inverted
        onEndReached={onLoadMoreChat}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={<Text style={styles.emptyChat}>No chat messages yet.</Text>}
        renderItem={({ item }) => <ChatRow message={item} theme={theme} />}
      />
    </View>
  );
}

// Renders the broadcaster's camera track — must live inside <LiveKitRoom>
// to read the room context useTracks depends on.
function RemoteVideo() {
  const theme = useTheme();
  const tracks = useTracks([Track.Source.Camera]);
  const track = tracks[0];

  if (!track) {
    return (
      <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={theme.colors.background} />
      </View>
    );
  }
  return <VideoTrack trackRef={track} style={StyleSheet.absoluteFill} objectFit="contain" />;
}

function ChatRow({ message, theme }: { message: LivestreamChatMessage; theme: Theme }) {
  const styles = createStyles(theme);
  return (
    <View style={styles.chatRow}>
      <Avatar uri={message.sender.avatarUrl} name={message.sender.displayName ?? message.sender.username} size={20} />
      <Text style={styles.chatBody}>
        <Text style={styles.chatSender}>{message.sender.displayName ?? `@${message.sender.username}`} </Text>
        {message.body}
      </Text>
      <Text style={styles.chatTime}>{relativeTime(message.createdAt)}</Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space[6] },
    videoArea: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
    videoPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
    videoPlaceholderText: { color: theme.colors.background, fontSize: theme.text.sm },
    streamerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space[2],
      padding: theme.space[3],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    streamerText: { flex: 1, gap: 1 },
    title: { color: theme.colors.foreground, fontSize: theme.text.base, fontWeight: theme.weight.emphasis },
    creatorName: { color: theme.colors.mutedForeground, fontSize: theme.text.xs },
    chatList: { flex: 1 },
    chatContent: { padding: theme.space[3], gap: theme.space[2] },
    emptyChat: { color: theme.colors.mutedForeground, fontSize: theme.text.sm, textAlign: "center", padding: theme.space[4], transform: [{ scaleY: -1 }] },
    chatRow: { flexDirection: "row", alignItems: "flex-start", gap: theme.space[2] },
    chatBody: { flex: 1, color: theme.colors.foreground, fontSize: theme.text.sm, lineHeight: theme.text.sm * 1.3 },
    chatSender: { fontWeight: theme.weight.emphasis },
    chatTime: { color: theme.colors.mutedForeground, fontSize: theme.text.xs, alignSelf: "flex-end" },
  });
}
