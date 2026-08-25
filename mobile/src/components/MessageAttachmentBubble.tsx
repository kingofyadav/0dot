import { useMemo } from "react";
import { Linking, Pressable, StyleSheet, Text } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import Ionicons from "@expo/vector-icons/Ionicons";
import { haptics } from "../utils/haptics";
import { useTheme, type Theme } from "../theme";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function filenameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.split("/").pop() || "File");
  } catch {
    return "File";
  }
}

// Mobile pro-upgrade addendum, sub-phase M13 (voice notes + file attach).
// Two attachment kinds, one component — voice_note gets a play/pause
// button + duration (durationS is the sender-supplied label
// resolveMessageAttachment trusts for display, per that function's own
// comment; while actually playing, the live player position takes over so
// the label counts down accurately instead of staying frozen at the
// recorded length); file gets a type icon + filename, tapping opens it in
// the system browser/viewer (Linking, not expo-web-browser — this may be
// a non-http content handoff to another app, e.g. a PDF viewer, which
// WebBrowser's in-app tab isn't meant for).
export function MessageAttachmentBubble({
  type,
  url,
  durationS,
  isMine,
}: {
  type: "voice_note" | "file";
  url: string;
  durationS: number | null;
  isMine: boolean;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const tintColor = isMine ? theme.colors.onAccent : theme.colors.foreground;

  if (type === "voice_note") {
    return <VoiceNoteRow url={url} durationS={durationS} tintColor={tintColor} />;
  }

  const filename = filenameFromUrl(url);
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        Linking.openURL(url).catch(() => {});
      }}
      accessibilityRole="button"
      accessibilityLabel={`Open file ${filename}`}
      style={styles.fileRow}
    >
      <Ionicons name="document-outline" size={20} color={tintColor} />
      <Text style={[styles.fileText, { color: tintColor }]} numberOfLines={1}>
        {filename}
      </Text>
    </Pressable>
  );
}

function VoiceNoteRow({ url, durationS, tintColor }: { url: string; durationS: number | null; tintColor: string }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);

  const displaySeconds = status.playing || status.currentTime > 0 ? Math.max(status.duration - status.currentTime, 0) : (durationS ?? status.duration);

  return (
    <Pressable
      onPress={() => {
        haptics.light();
        if (status.playing) {
          player.pause();
        } else {
          if (status.currentTime >= status.duration && status.duration > 0) player.seekTo(0);
          player.play();
        }
      }}
      accessibilityRole="button"
      accessibilityLabel={status.playing ? "Pause voice note" : "Play voice note"}
      style={styles.voiceRow}
    >
      <Ionicons name={status.playing ? "pause-circle" : "play-circle"} size={30} color={tintColor} />
      <Text style={[styles.voiceDuration, { color: tintColor }]}>{formatDuration(displaySeconds)}</Text>
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    fileRow: { flexDirection: "row", alignItems: "center", gap: theme.space[2], minWidth: 140 },
    fileText: { fontSize: theme.text.sm, flexShrink: 1 },
    voiceRow: { flexDirection: "row", alignItems: "center", gap: theme.space[2], minWidth: 120 },
    voiceDuration: { fontSize: theme.text.sm, fontWeight: theme.weight.label },
  });
}
