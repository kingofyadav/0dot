import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { registerGlobals, AudioSession } from "@livekit/react-native";
import { Room, RoomEvent } from "livekit-client";
import { useAuth } from "../auth/AuthContext";
import { getVoiceRoom, voiceRoomAction, getVoiceRoomToken, ApiError } from "../api/client";
import { createVoiceRoomStream } from "../realtime/voiceRoomStream";
import { Avatar } from "../components/Avatar";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { haptics } from "../utils/haptics";
import { useTheme, type Theme } from "../theme";
import type { VoiceRoomDetail, VoiceRoomAction } from "../api/types";

// react-native-webrtc's globals must be registered once, before any Room is
// constructed. Module scope + a guard — safe to import this screen multiple
// times.
let globalsRegistered = false;
function ensureGlobals() {
  if (globalsRegistered) return;
  registerGlobals();
  globalsRegistered = true;
}

const MAX_FLOOR_HOLD_MS = 60_000; // mirrors src/lib/voice-rooms.ts

// Realtime addendum Phase D3 (docs/specs/addendum-voice-rooms-livekit.md) —
// the mobile voice-room screen. Audio on a LiveKit SFU; the FIFO
// "request → wait your turn → hold the floor" model is all server state,
// refetched on each `room-updated` from the SSE. Only the current speaker
// publishes a mic track (server grants/revokes the LiveKit permission; this
// screen toggles the local capture to match).
export function VoiceRoomBody({ slug, roomId }: { slug: string; roomId: string }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { me, tokens } = useAuth();

  const [detail, setDetail] = useState<VoiceRoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  const connectedRef = useRef(false);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const iAmSpeaking = detail?.currentSpeakerId != null && detail.currentSpeakerId === me?.id;

  const load = useCallback(async () => {
    try {
      setDetail(await getVoiceRoom(slug, roomId));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this room.");
    }
  }, [slug, roomId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  // Room-state SSE — refetch the detail on any room-updated / reconnect.
  useEffect(() => {
    const accessToken = tokens?.accessToken;
    if (!accessToken || !detail?.isParticipant) return;
    const stream = createVoiceRoomStream({ slug, roomId, accessToken, onEvent: () => load() });
    stream.setActive(AppState.currentState === "active");
    const sub = AppState.addEventListener("change", (s) => stream.setActive(s === "active"));
    return () => {
      sub.remove();
      stream.close();
    };
  }, [slug, roomId, tokens?.accessToken, detail?.isParticipant, load]);

  // Connect to the LiveKit room once we're a participant; disconnect on
  // leave / unmount / background.
  useEffect(() => {
    if (!detail?.isParticipant || detail.status !== "live") return;
    let cancelled = false;
    ensureGlobals();

    const room = new Room();
    roomRef.current = room;
    room.on(RoomEvent.Disconnected, () => {
      connectedRef.current = false;
    });

    let audioStarted = false;
    (async () => {
      try {
        await AudioSession.startAudioSession();
        audioStarted = true;
        const { token, url } = await getVoiceRoomToken(slug, roomId);
        if (cancelled) return;
        await room.connect(url, token);
        if (cancelled) {
          void room.disconnect();
          return;
        }
        connectedRef.current = true;
        setMicError(null);
        if (detail.currentSpeakerId === me?.id) await enableMic(room);
      } catch {
        if (!cancelled) setMicError("Couldn't connect to the room's audio.");
      }
    })();

    return () => {
      cancelled = true;
      connectedRef.current = false;
      if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
      void room.disconnect();
      roomRef.current = null;
      if (audioStarted) void AudioSession.stopAudioSession();
    };
    // Keyed on participation/room only — the mic-toggle effect handles the floor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.isParticipant, detail?.status, slug, roomId]);

  async function enableMic(room: Room) {
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
      setMicError(null);
      if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = setTimeout(() => void act("stop-speaking"), MAX_FLOOR_HOLD_MS);
    } catch {
      setMicError("Couldn't access your microphone. Check the app's permissions.");
      void act("stop-speaking");
    }
  }

  // Toggle the local mic to follow the floor (server already moved the
  // LiveKit publish grant).
  useEffect(() => {
    const room = roomRef.current;
    if (!room || !connectedRef.current) return;
    if (iAmSpeaking) {
      void enableMic(room);
    } else {
      void room.localParticipant.setMicrophoneEnabled(false);
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iAmSpeaking]);

  async function act(action: VoiceRoomAction) {
    if (busy) return;
    setBusy(true);
    try {
      await voiceRoomAction(slug, roomId, action);
      await load();
    } catch (err) {
      haptics.warning();
      Alert.alert("Couldn't do that", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setBusy(false);
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
        <EmptyState icon="mic-off-outline" message={error ?? "Room not found."} onRetry={error ? load : undefined} />
      </View>
    );
  }
  if (detail.status !== "live") {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="mic-off-outline"
          message={detail.status === "ended" ? "This room has ended." : "This room hasn't started yet."}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.speakerBanner}>
        <Ionicons
          name={detail.currentSpeakerId ? "mic" : "mic-off-outline"}
          size={18}
          color={detail.currentSpeakerId ? theme.colors.accent : theme.colors.mutedForeground}
        />
        <Text style={styles.speakerText}>
          {detail.currentSpeakerId
            ? `${iAmSpeaking ? "You are" : `${detail.currentSpeakerName ?? "Someone"} is`} speaking`
            : "The floor is free"}
        </Text>
      </View>

      {micError ? <Text style={styles.errorText}>{micError}</Text> : null}

      <View style={styles.actions}>
        {!detail.isParticipant ? (
          <Button label="Join room" onPress={() => act("join")} loading={busy} style={styles.actionButton} />
        ) : (
          <>
            {detail.myRole === "listener" && detail.canSpeak ? (
              <Button label="Request to speak" variant="secondary" onPress={() => act("request-speak")} loading={busy} style={styles.actionButton} />
            ) : null}
            {detail.myRole === "requesting_to_speak" ? (
              <>
                <Text style={styles.queueText}>
                  {detail.isMyTurnNext ? "It's your turn" : `#${detail.queuePosition} in line`}
                </Text>
                {detail.isMyTurnNext ? (
                  <Button label="Start speaking" onPress={() => act("start-speaking")} loading={busy} style={styles.actionButton} />
                ) : null}
                <Button label="Cancel request" variant="secondary" onPress={() => act("cancel-request")} loading={busy} style={styles.actionButton} />
              </>
            ) : null}
            {iAmSpeaking ? (
              <Button label="Stop speaking" variant="secondary" onPress={() => act("stop-speaking")} loading={busy} style={styles.actionButton} />
            ) : null}
            {detail.isStaff && detail.currentSpeakerId && !iAmSpeaking ? (
              <Button label="Force stop speaker" variant="secondary" onPress={() => act("force-stop")} loading={busy} style={styles.actionButton} />
            ) : null}
            <Button label="Leave room" variant="secondary" onPress={() => act("leave")} loading={busy} style={styles.actionButton} />
          </>
        )}
      </View>

      <Text style={styles.sectionLabel}>In this room ({detail.participants.length})</Text>
      {detail.participants.map((p) => (
        <View key={p.userId} style={styles.participantRow}>
          <Avatar uri={p.avatarUrl} name={p.displayName} size={32} />
          <Text style={styles.participantName} numberOfLines={1}>
            {p.userId === me?.id ? "You" : p.displayName}
          </Text>
          {p.userId === detail.currentSpeakerId ? <Ionicons name="mic" size={15} color={theme.colors.accent} /> : null}
          {p.role === "requesting_to_speak" ? <Ionicons name="hand-left-outline" size={15} color={theme.colors.mutedForeground} /> : null}
        </View>
      ))}
    </ScrollView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.space[4], gap: theme.space[3] },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space[6] },
    speakerBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space[2],
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      padding: theme.space[3],
    },
    speakerText: { color: theme.colors.foreground, fontSize: theme.text.base, fontWeight: theme.weight.emphasis },
    errorText: { color: theme.colors.danger, fontSize: theme.text.sm },
    actions: { gap: theme.space[2] },
    actionButton: { minWidth: 160 },
    queueText: { color: theme.colors.mutedForeground, fontSize: theme.text.sm, textAlign: "center" },
    sectionLabel: {
      color: theme.colors.mutedForeground,
      fontSize: theme.text.xs,
      fontWeight: theme.weight.label,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      marginTop: theme.space[2],
    },
    participantRow: { flexDirection: "row", alignItems: "center", gap: theme.space[2], paddingVertical: theme.space[1] },
    participantName: { flex: 1, color: theme.colors.foreground, fontSize: theme.text.sm },
  });
}
