import { useCallback, useMemo, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect } from "expo-router";
import { getWalletReferral, ApiError } from "../../src/api/client";
import { API_BASE_URL } from "../../src/config";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";
import { EmptyState } from "../../src/components/EmptyState";
import { SkeletonBlock } from "../../src/components/Skeleton";
import { haptics } from "../../src/utils/haptics";
import { useContentMaxWidth } from "../../src/utils/responsive";
import { useTheme, type Theme } from "../../src/theme";
import type { ReferralInfo } from "../../src/api/types";

export default function WalletReferralScreen() {
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setInfo(await getWalletReferral());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your referral info.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        await load();
        setLoading(false);
      })();
    }, [load])
  );

  if (loading) {
    return (
      <View style={[styles.screen, { padding: theme.space[5], gap: theme.space[3] }]}>
        <SkeletonBlock width="100%" height={100} radius={theme.radius.lg} />
        <SkeletonBlock width="100%" height={60} radius={theme.radius.lg} />
      </View>
    );
  }

  if (!info) {
    return (
      <View style={styles.screen}>
        <EmptyState icon="gift-outline" message={error ?? "Could not load your referral info."} onRetry={error ? load : undefined} />
      </View>
    );
  }

  const fullUrl = `${API_BASE_URL}${info.joinUrl}`;

  async function onShare() {
    haptics.light();
    try {
      await Share.share({ message: fullUrl, url: fullUrl });
    } catch {
      // User-cancelled or platform share-sheet failure — nothing to recover from.
    }
  }

  async function onCopy() {
    haptics.light();
    await Clipboard.setStringAsync(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <View style={[styles.screen, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null, styles.content]}>
      <Card elevated style={styles.card}>
        <Text style={styles.label}>Your invite code</Text>
        <Text style={styles.code}>{info.code}</Text>
        <Text style={styles.link} numberOfLines={1}>
          {fullUrl}
        </Text>
        <View style={styles.actions}>
          <Button label="Share" onPress={onShare} style={styles.actionButton} />
          <Button label={copied ? "Copied!" : "Copy link"} variant="secondary" onPress={onCopy} style={styles.actionButton} />
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionHeading}>How it works</Text>
        <Text style={styles.body}>
          Earn {info.rewardCoinsPerInvite} coins for every friend who joins with your link, up to {info.maxRewardedInvites} rewarded
          invites.
        </Text>
      </Card>

      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{info.attributedSignups}</Text>
          <Text style={styles.statLabel}>Signups</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>
            {info.rewardedInvites}/{info.maxRewardedInvites}
          </Text>
          <Text style={styles.statLabel}>Rewarded</Text>
        </Card>
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.space[5], gap: theme.space[4] },
    card: { gap: theme.space[2] },
    label: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    code: { color: theme.colors.foreground, fontSize: 32, fontWeight: theme.weight.heading, letterSpacing: 1 },
    link: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    actions: { flexDirection: "row", gap: theme.space[3], marginTop: theme.space[2] },
    actionButton: { flex: 1 },
    sectionHeading: { fontSize: theme.text.base, fontWeight: theme.weight.heading, color: theme.colors.foreground },
    body: { color: theme.colors.mutedForeground, fontSize: theme.text.sm, lineHeight: 20 },
    statsRow: { flexDirection: "row", gap: theme.space[3] },
    statCard: { flex: 1, alignItems: "center", gap: theme.space[1] },
    statValue: { color: theme.colors.foreground, fontSize: theme.text.xl, fontWeight: theme.weight.heading },
    statLabel: { color: theme.colors.mutedForeground, fontSize: theme.text.xs },
  });
}
