import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as WebBrowser from "expo-web-browser";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { getEvent, rsvpToEvent, ApiError } from "../../src/api/client";
import { Button } from "../../src/components/Button";
import { Chip } from "../../src/components/Chip";
import { EmptyState } from "../../src/components/EmptyState";
import { SkeletonBlock } from "../../src/components/Skeleton";
import { haptics } from "../../src/utils/haptics";
import { API_BASE_URL } from "../../src/config";
import { useTheme, type Theme } from "../../src/theme";
import type { EventDetail, EventRsvpStatus } from "../../src/api/types";

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(new Date(iso));
}

const RSVP_OPTIONS: { key: EventRsvpStatus; label: string }[] = [
  { key: "going", label: "Going" },
  { key: "interested", label: "Interested" },
  { key: "not_going", label: "Can't go" },
];

// Ticket purchase opens the web event page (Phase 15 §6: native purchase
// flows are flagged, not implemented here) — RSVP is free and native.
export default function EventScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rsvpBusy, setRsvpBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEvent(await getEvent(slug));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this event.");
    }
  }, [slug]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        await load();
        setLoading(false);
      })();
    }, [load])
  );

  async function onRsvp(status: EventRsvpStatus) {
    if (!event || rsvpBusy) return;
    haptics.light();
    setRsvpBusy(true);
    const prevStatus = event.myRsvpStatus;
    setEvent({ ...event, myRsvpStatus: status });
    try {
      await rsvpToEvent(slug, status);
    } catch (err) {
      haptics.warning();
      setEvent((prev) => (prev ? { ...prev, myRsvpStatus: prevStatus } : prev));
      setError(err instanceof ApiError ? err.message : "Could not RSVP.");
    } finally {
      setRsvpBusy(false);
    }
  }

  function onGetTickets() {
    haptics.light();
    WebBrowser.openBrowserAsync(`${API_BASE_URL}/e/${slug}`).catch(() => {});
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.center, { gap: theme.space[3] }]}>
        <SkeletonBlock width="100%" height={16} />
        <SkeletonBlock width="60%" height={16} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.screen}>
        <EmptyState icon="calendar-outline" message={error ?? "Event not found."} onRetry={error ? load : undefined} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: event.title }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {event.coverImageUrl ? (
          <Image source={{ uri: event.coverImageUrl }} style={styles.cover} contentFit="cover" />
        ) : null}

        <View style={styles.body}>
          <Text style={styles.title}>{event.title}</Text>
          <Text style={styles.host}>Hosted by {event.hostLabel}</Text>

          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={16} color={theme.colors.mutedForeground} />
            <Text style={styles.infoText}>{formatWhen(event.startsAt)}</Text>
          </View>
          {event.location ? (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={16} color={theme.colors.mutedForeground} />
              <Text style={styles.infoText}>{event.location}</Text>
            </View>
          ) : null}
          <View style={styles.infoRow}>
            <Ionicons name="people-outline" size={16} color={theme.colors.mutedForeground} />
            <Text style={styles.infoText}>
              {event.goingCount} going · {event.interestedCount} interested
            </Text>
          </View>

          <View style={styles.rsvpRow}>
            {RSVP_OPTIONS.map((option) => (
              <Chip key={option.key} label={option.label} selected={event.myRsvpStatus === option.key} onPress={() => onRsvp(option.key)} />
            ))}
          </View>

          {event.description ? <Text style={styles.description}>{event.description}</Text> : null}

          {event.ticketTypes.length > 0 ? (
            <View style={styles.ticketsSection}>
              <Text style={styles.sectionHeading}>Tickets</Text>
              {event.ticketTypes.map((t) => (
                <View key={t.id} style={styles.ticketRow}>
                  <Text style={styles.ticketName}>{t.name}</Text>
                  <Text style={styles.ticketPrice}>{t.price === null ? "Free" : `${(t.currency ?? "usd").toUpperCase()} ${t.price.toFixed(2)}`}</Text>
                </View>
              ))}
              <Button label="Get tickets" onPress={onGetTickets} style={styles.ticketsButton} />
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </ScrollView>
    </>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    center: { alignItems: "center", justifyContent: "center", padding: theme.space[5] },
    content: { paddingBottom: theme.space[8] },
    cover: { width: "100%", height: 180 },
    body: { padding: theme.space[5], gap: theme.space[2] },
    title: { fontSize: theme.text.xl, fontWeight: theme.weight.heading, color: theme.colors.foreground },
    host: { color: theme.colors.mutedForeground, fontSize: theme.text.sm, marginBottom: theme.space[2] },
    infoRow: { flexDirection: "row", alignItems: "center", gap: theme.space[2] },
    infoText: { color: theme.colors.foreground, fontSize: theme.text.sm },
    rsvpRow: { flexDirection: "row", gap: theme.space[2], marginTop: theme.space[3], flexWrap: "wrap" },
    description: { color: theme.colors.foreground, fontSize: theme.text.base, lineHeight: theme.text.base * 1.4, marginTop: theme.space[3] },
    ticketsSection: { marginTop: theme.space[5], gap: theme.space[2] },
    sectionHeading: { fontSize: theme.text.lg, fontWeight: theme.weight.heading, color: theme.colors.foreground },
    ticketRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: theme.space[2],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    ticketName: { color: theme.colors.foreground, fontSize: theme.text.base },
    ticketPrice: { color: theme.colors.mutedForeground, fontSize: theme.text.base },
    ticketsButton: { marginTop: theme.space[2] },
    error: { color: theme.colors.danger, fontSize: theme.text.sm, marginTop: theme.space[2] },
  });
}
