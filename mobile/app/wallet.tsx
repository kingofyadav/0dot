import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "expo-router";
import { getWallet, transferCoins, ApiError } from "../src/api/client";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { EmptyState } from "../src/components/EmptyState";
import { SkeletonBlock } from "../src/components/Skeleton";
import { haptics } from "../src/utils/haptics";
import { relativeTime } from "../src/utils/relativeTime";
import { useContentMaxWidth } from "../src/utils/responsive";
import { useTheme, type Theme } from "../src/theme";
import type { WalletResponse, WalletTransferEntry } from "../src/api/types";

const MAX_TRANSFER_COINS = 20;

export default function WalletScreen() {
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setWallet(await getWallet());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your wallet.");
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

  async function onRefresh() {
    setRefreshing(true);
    haptics.light();
    await load();
    setRefreshing(false);
  }

  async function onSend() {
    const coinAmount = Math.round(Number(amount));
    if (!username.trim() || !Number.isFinite(coinAmount) || coinAmount < 1 || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await transferCoins({ username: username.trim(), coinAmount });
      haptics.light();
      setUsername("");
      setAmount("");
      await load();
    } catch (err) {
      haptics.warning();
      setSendError(err instanceof ApiError ? err.message : "Could not send coins.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.screen, { padding: theme.space[5], gap: theme.space[3] }]}>
        <SkeletonBlock width="100%" height={100} radius={theme.radius.lg} />
        <SkeletonBlock width="100%" height={16} />
      </View>
    );
  }

  if (!wallet) {
    return (
      <View style={styles.screen}>
        <EmptyState icon="wallet-outline" message={error ?? "Could not load your wallet."} onRetry={error ? load : undefined} />
      </View>
    );
  }

  return (
    <FlatList
      style={[styles.screen, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}
      contentContainerStyle={styles.list}
      data={wallet.history}
      keyExtractor={(entry) => entry.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Card elevated style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Coin balance</Text>
            <Text style={styles.balanceValue}>{wallet.coinBalance}</Text>
          </Card>

          <Card style={styles.transferCard}>
            <Text style={styles.sectionHeading}>Send coins</Text>
            <TextInput
              style={styles.input}
              placeholder="Recipient username"
              placeholderTextColor={theme.colors.mutedForeground}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              placeholder={`Amount (max ${MAX_TRANSFER_COINS})`}
              placeholderTextColor={theme.colors.mutedForeground}
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
            />
            {sendError ? <Text style={styles.error}>{sendError}</Text> : null}
            <Button label="Send" onPress={onSend} loading={sending} disabled={!username.trim() || !amount} style={styles.sendButton} />
          </Card>

          <Text style={styles.sectionHeading}>History</Text>
        </View>
      }
      ListEmptyComponent={<EmptyState icon="receipt-outline" message="No transfers yet." />}
      renderItem={({ item }) => <HistoryRow entry={item} theme={theme} />}
    />
  );
}

function HistoryRow({ entry, theme }: { entry: WalletTransferEntry; theme: Theme }) {
  const styles = createStyles(theme);
  const isSent = entry.direction === "sent";
  return (
    <View style={styles.historyRow}>
      <View style={[styles.historyIcon, { backgroundColor: isSent ? theme.colors.dangerSoft : theme.colors.successSoft }]}>
        <Ionicons name={isSent ? "arrow-up" : "arrow-down"} size={16} color={isSent ? theme.colors.danger : theme.colors.success} />
      </View>
      <View style={styles.historyBody}>
        <Text style={styles.historyName}>
          {isSent ? "To " : "From "}
          {entry.counterpartyDisplayName ?? `@${entry.counterpartyUsername}`}
        </Text>
        <Text style={styles.historyTime}>{relativeTime(entry.createdAt)}</Text>
      </View>
      <Text style={[styles.historyAmount, { color: isSent ? theme.colors.danger : theme.colors.success }]}>
        {isSent ? "-" : "+"}
        {entry.amount}
      </Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    list: { padding: theme.space[5], gap: theme.space[2] },
    header: { gap: theme.space[4], marginBottom: theme.space[2] },
    balanceCard: { alignItems: "center", gap: theme.space[1] },
    balanceLabel: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    balanceValue: { color: theme.colors.foreground, fontSize: 40, fontWeight: theme.weight.heading },
    transferCard: { gap: theme.space[2] },
    sectionHeading: { fontSize: theme.text.lg, fontWeight: theme.weight.heading, color: theme.colors.foreground },
    input: {
      minHeight: 44,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
      color: theme.colors.foreground,
      fontSize: theme.text.base,
      paddingHorizontal: theme.space[3],
    },
    error: { color: theme.colors.danger, fontSize: theme.text.sm },
    sendButton: { marginTop: theme.space[1] },
    historyRow: { flexDirection: "row", alignItems: "center", gap: theme.space[3], paddingVertical: theme.space[2] },
    historyIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    historyBody: { flex: 1, gap: 2 },
    historyName: { color: theme.colors.foreground, fontSize: theme.text.base, fontWeight: theme.weight.label },
    historyTime: { color: theme.colors.mutedForeground, fontSize: theme.text.xs },
    historyAmount: { fontSize: theme.text.base, fontWeight: theme.weight.emphasis },
  });
}
