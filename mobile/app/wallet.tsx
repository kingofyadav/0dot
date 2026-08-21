import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "expo-router";
import { getWallet, getProfile, transferCoins, ApiError } from "../src/api/client";
import { Avatar } from "../src/components/Avatar";
import { BottomSheet } from "../src/components/BottomSheet";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { EmptyState } from "../src/components/EmptyState";
import { SkeletonBlock } from "../src/components/Skeleton";
import { VerifiedBadge } from "../src/components/VerifiedBadge";
import { haptics } from "../src/utils/haptics";
import { relativeTime } from "../src/utils/relativeTime";
import { useContentMaxWidth } from "../src/utils/responsive";
import { useTheme, type Theme } from "../src/theme";
import type { Profile, WalletResponse, WalletTransferEntry } from "../src/api/types";

const MAX_TRANSFER_COINS = 20;

// Snapshot of who's about to receive coins and how many — captured once at
// "Review transfer" time so the confirm sheet can't drift if the (disabled,
// backdrop-covered) form fields behind it were somehow touched again before
// the user actually confirms.
type PendingTransfer = { profile: Profile; coinAmount: number };

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
  const [resolving, setResolving] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingTransfer | null>(null);
  const [sending, setSending] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

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

  // Doesn't move any coins — resolves the typed username to a real profile
  // and opens the confirm sheet so the sender sees who they're actually
  // about to pay before anything irreversible happens. A typo that happens
  // to land on someone else's real, valid username won't error here (the
  // account exists), but showing their actual name/avatar back is exactly
  // what catches "that's not who I meant" that a bare error message can't.
  async function onSend() {
    const recipient = username.trim();
    const coinAmount = Math.round(Number(amount));
    setSendError(null);
    if (!recipient || !Number.isFinite(coinAmount) || coinAmount < 1 || resolving) return;
    if (coinAmount > MAX_TRANSFER_COINS) {
      setSendError(`You can send at most ${MAX_TRANSFER_COINS} coins at a time.`);
      return;
    }
    setResolving(true);
    try {
      const profile = await getProfile(recipient);
      if (profile.isOwnProfile) {
        setSendError("You can't send coins to yourself.");
        return;
      }
      setConfirmError(null);
      setPending({ profile, coinAmount });
    } catch (err) {
      haptics.warning();
      if (err instanceof ApiError) {
        // profiles/[username]'s own 404 message ("Not found.") reads fine
        // on a profile page but is ambiguous as a wallet error — spelled
        // out here instead of relaying it verbatim.
        setSendError(err.status === 404 ? `Couldn't find @${recipient}.` : err.message);
      } else {
        setSendError("Could not look up that user.");
      }
    } finally {
      setResolving(false);
    }
  }

  function closeConfirm() {
    if (sending) return;
    setPending(null);
    setConfirmError(null);
  }

  // The actual, irreversible send — only reachable from the confirm sheet.
  async function onConfirmSend() {
    if (!pending || sending) return;
    setSending(true);
    setConfirmError(null);
    try {
      await transferCoins({ username: pending.profile.username, coinAmount: pending.coinAmount });
      haptics.light();
      setPending(null);
      setUsername("");
      setAmount("");
      await load();
    } catch (err) {
      haptics.warning();
      setConfirmError(err instanceof ApiError ? err.message : "Could not send coins.");
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
    <>
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
              <Button
                label="Review transfer"
                onPress={onSend}
                loading={resolving}
                disabled={!username.trim() || !amount}
                style={styles.sendButton}
              />
            </Card>

            <Text style={styles.sectionHeading}>History</Text>
          </View>
        }
        ListEmptyComponent={<EmptyState icon="receipt-outline" message="No transfers yet." />}
        renderItem={({ item }) => <HistoryRow entry={item} theme={theme} />}
      />

      <BottomSheet visible={!!pending} onClose={closeConfirm} title="Confirm transfer">
        {pending ? (
          <View style={styles.confirmBody}>
            <Text style={styles.confirmLabel}>Sending to</Text>
            <View style={styles.confirmRecipient}>
              <Avatar uri={pending.profile.avatarUrl} name={pending.profile.displayName} size={48} />
              <View style={styles.confirmRecipientText}>
                <View style={styles.confirmNameRow}>
                  <Text style={styles.confirmName} numberOfLines={1}>
                    {pending.profile.displayName}
                  </Text>
                  {pending.profile.isVerified ? <VerifiedBadge size={14} /> : null}
                </View>
                <Text style={styles.confirmHandle}>@{pending.profile.username}</Text>
              </View>
            </View>

            <Text style={styles.confirmLabel}>Amount</Text>
            <Text style={styles.confirmAmount}>
              {pending.coinAmount} {pending.coinAmount === 1 ? "coin" : "coins"}
            </Text>

            {confirmError ? <Text style={styles.error}>{confirmError}</Text> : null}

            <View style={styles.confirmActions}>
              <Button label="Cancel" variant="secondary" onPress={closeConfirm} disabled={sending} style={styles.confirmActionButton} />
              <Button label="Confirm & send" onPress={onConfirmSend} loading={sending} style={styles.confirmActionButton} />
            </View>
          </View>
        ) : null}
      </BottomSheet>
    </>
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
    confirmBody: { gap: theme.space[2], paddingBottom: theme.space[2] },
    confirmLabel: { color: theme.colors.mutedForeground, fontSize: theme.text.xs, marginTop: theme.space[2] },
    confirmRecipient: { flexDirection: "row", alignItems: "center", gap: theme.space[3] },
    confirmRecipientText: { flex: 1, gap: 2 },
    confirmNameRow: { flexDirection: "row", alignItems: "center", gap: theme.space[1] },
    confirmName: { color: theme.colors.foreground, fontSize: theme.text.base, fontWeight: theme.weight.emphasis },
    confirmHandle: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    confirmAmount: { color: theme.colors.foreground, fontSize: theme.text.xl, fontWeight: theme.weight.heading },
    confirmActions: { flexDirection: "row", gap: theme.space[3], marginTop: theme.space[3] },
    confirmActionButton: { flex: 1 },
  });
}
