import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getNotificationPreferences, updateNotificationPreference, ApiError } from "../src/api/client";
import { getNotificationIcon } from "../src/utils/notificationIcon";
import { EmptyState } from "../src/components/EmptyState";
import { SettingsRowSkeleton } from "../src/components/Skeleton";
import { haptics } from "../src/utils/haptics";
import { useTheme, type Theme } from "../src/theme";
import type { NotificationPreferenceChannel } from "../src/api/types";

// Human-readable labels for the curated catalogs mirrored from
// s/[username]/notifications/page.tsx on the web app (PUSH_NOTIFICATION_TYPES
// there, EMAIL_NOTIFICATION_TYPES from lib/email.ts) — that page uses
// getNotificationVerb() phrased as a live sentence fragment ("liked your
// post"); a settings toggle needs a standalone noun instead, so labels are
// kept separately here rather than reused from there.
const LABELS: Record<string, string> = {
  like: "Likes",
  comment: "Comments",
  mention: "Mentions",
  new_follower: "New followers",
  message: "Messages",
  community_update: "Community updates",
  tip_received: "Tips received",
  new_subscriber: "New subscribers",
  livestream_started: "Livestreams starting",
  event_cancelled: "Event cancellations",
  ticket_purchased: "Ticket purchases",
  appointment_request: "Appointment requests",
};

type Row = { type: string; enabled: boolean };

export default function NotificationPreferencesScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [push, setPush] = useState<Row[] | null>(null);
  const [email, setEmail] = useState<Row[] | null>(null);
  const [deviceCount, setDeviceCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await getNotificationPreferences();
        setPush(result.push);
        setEmail(result.email);
        setDeviceCount(result.deviceCount);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load your notification preferences.");
      }
    })();
  }, []);

  async function onToggle(channel: NotificationPreferenceChannel, type: string, enabled: boolean) {
    haptics.light();
    const setRows = channel === "push" ? setPush : setEmail;
    setRows((prev) => (prev ? prev.map((row) => (row.type === type ? { ...row, enabled } : row)) : prev));
    try {
      await updateNotificationPreference({ notificationType: type, channel, enabled });
    } catch {
      haptics.warning();
      setRows((prev) => (prev ? prev.map((row) => (row.type === type ? { ...row, enabled: !enabled } : row)) : prev));
    }
  }

  if (error) {
    return (
      <View style={styles.screen}>
        <EmptyState icon="cloud-offline-outline" message={error} />
      </View>
    );
  }

  if (!push || !email) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.group}>
          {[0, 1, 2, 3].map((i) => (
            <SettingsRowSkeleton key={i} />
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.deviceNote}>
        {deviceCount > 0
          ? `Push notifications are enabled on ${deviceCount} device${deviceCount === 1 ? "" : "s"}.`
          : "No devices registered for push yet."}
      </Text>

      <Text style={styles.sectionHeading}>Push notifications</Text>
      <View style={styles.group}>
        {push.map((row) => (
          <PreferenceRow
            key={`push-${row.type}`}
            type={row.type}
            enabled={row.enabled}
            onToggle={(enabled) => onToggle("push", row.type, enabled)}
          />
        ))}
      </View>

      <Text style={styles.sectionHeading}>Email notifications</Text>
      <View style={styles.group}>
        {email.map((row) => (
          <PreferenceRow
            key={`email-${row.type}`}
            type={row.type}
            enabled={row.enabled}
            onToggle={(enabled) => onToggle("email", row.type, enabled)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function PreferenceRow({ type, enabled, onToggle }: { type: string; enabled: boolean; onToggle: (enabled: boolean) => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { icon, tint } = getNotificationIcon(type);

  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={theme.colors[tint]} />
      <Text style={styles.rowLabel}>{LABELS[type] ?? type}</Text>
      <Switch
        value={enabled}
        onValueChange={onToggle}
        trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
        thumbColor={theme.colors.surface}
        accessibilityLabel={`${LABELS[type] ?? type} notifications`}
      />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.space[5], gap: theme.space[2] },
    deviceNote: { color: theme.colors.mutedForeground, fontSize: theme.text.sm, marginBottom: theme.space[3] },
    sectionHeading: {
      fontSize: theme.text.sm,
      fontWeight: theme.weight.label,
      color: theme.colors.mutedForeground,
      textTransform: "uppercase",
      marginTop: theme.space[4],
      marginBottom: theme.space[2],
    },
    group: {
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.lg,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space[3],
      paddingHorizontal: theme.space[4],
      paddingVertical: theme.space[3],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
      minHeight: 44,
    },
    rowLabel: { flex: 1, color: theme.colors.foreground, fontSize: theme.text.base },
  });
}
