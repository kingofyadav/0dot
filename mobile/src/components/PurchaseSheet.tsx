import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import * as Crypto from "expo-crypto";
import { getWallet, purchaseWithCoins, ApiError } from "../api/client";
import { isBiometricLockAvailable, unlockWithBiometrics } from "../auth/biometricLock";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { haptics } from "../utils/haptics";
import { formatCoins } from "../utils/formatCoins";
import { useTheme, type Theme } from "../theme";
import type { PurchasableItemTarget } from "../api/types";

export type PurchaseSheetItem = {
  target: PurchasableItemTarget;
  id: string;
  title: string;
  // Coins; null = free.
  price: number | null;
};

// Confirm step for every buy-once coin purchase (marketplace listings,
// digital products, courses) — the same confirm-then-biometric shape the
// wallet's coin transfer uses. The server re-checks price, ownership, and
// balance; the balance shown here is only so the buyer sees what they're
// agreeing to before the charge. A 409 means an earlier attempt (e.g. one
// whose response was lost on a flaky connection) already went through, so
// it's reported as a success rather than an error.
export function PurchaseSheet({
  item,
  onClose,
  onPurchased,
}: {
  item: PurchaseSheetItem | null;
  onClose: () => void;
  onPurchased: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [balance, setBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // price === 0 is just as free as price === null -- a promo/free item the
  // server represents as a concrete 0-coin price must not fall into the
  // "needs balance + Buy now" path below.
  const isFree = item?.price === null || item?.price === 0;
  const needsBalance = Boolean(item) && !isFree;

  // One idempotency key per purchase attempt (regenerated whenever the
  // sheet opens for a different item), so a retry after a dropped/timed-out
  // response reuses the same key instead of the server seeing it as a
  // brand-new purchase and double-charging the buyer. item?.id is a deps-
  // only cache-buster, not read inside the memo — exhaustive-deps can't
  // tell that apart from a missing dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const idempotencyKey = useMemo(() => Crypto.randomUUID(), [item?.id]);

  useEffect(() => {
    if (!needsBalance) return;
    let cancelled = false;
    getWallet()
      .then((wallet) => {
        if (!cancelled) setBalance(wallet.balance.total);
      })
      .catch((err) => {
        if (!cancelled) setBalanceError(err instanceof ApiError ? err.message : "Could not load your balance.");
      });
    return () => {
      cancelled = true;
      setBalance(null);
      setBalanceError(null);
    };
  }, [needsBalance, item?.id]);

  function close() {
    if (buying) return;
    setError(null);
    onClose();
  }

  async function onConfirm() {
    if (!item || buying) return;
    setBuying(true);
    setError(null);
    try {
      if (!isFree && (await isBiometricLockAvailable())) {
        if (!(await unlockWithBiometrics())) {
          setBuying(false);
          return;
        }
      }
      await purchaseWithCoins({ target: item.target, id: item.id, idempotencyKey });
      haptics.medium();
      onPurchased();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        onPurchased();
      } else {
        haptics.warning();
        setError(err instanceof ApiError ? err.message : "Could not complete the purchase. Check your connection and try again.");
      }
    } finally {
      setBuying(false);
    }
  }

  const price = item?.price ?? 0;
  const shortBy = balance !== null && !isFree ? Math.max(0, price - balance) : 0;
  const canConfirm = isFree || (balance !== null && shortBy === 0);

  return (
    <BottomSheet visible={!!item} onClose={close} title={isFree ? "Get this item" : "Confirm purchase"}>
      {item ? (
        <View style={styles.body}>
          <Text style={styles.label}>Item</Text>
          <Text style={styles.itemTitle} numberOfLines={2}>
            {item.title}
          </Text>

          <Text style={styles.label}>Price</Text>
          <Text style={styles.price}>{isFree ? "Free" : formatCoins(price)}</Text>

          {!isFree ? (
            balance === null && !balanceError ? (
              <ActivityIndicator color={theme.colors.accent} style={styles.balanceLoading} />
            ) : balanceError ? (
              <Text style={styles.error}>{balanceError}</Text>
            ) : (
              <View style={styles.balanceRows} accessibilityRole="summary">
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Your balance</Text>
                  <Text style={styles.rowValue}>{formatCoins(balance!)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>After purchase</Text>
                  <Text style={[styles.rowValue, shortBy > 0 ? styles.negative : null]}>
                    {shortBy > 0 ? `${formatCoins(shortBy)} short` : formatCoins(balance! - price)}
                  </Text>
                </View>
              </View>
            )
          ) : null}

          {shortBy > 0 ? <Text style={styles.hint}>You don&apos;t have enough coins for this yet.</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={close} disabled={buying} style={styles.actionButton} />
            <Button
              label={isFree ? "Get it" : "Buy now"}
              onPress={onConfirm}
              loading={buying}
              disabled={!canConfirm}
              accessibilityLabel={isFree ? `Get ${item.title} for free` : `Buy ${item.title} for ${formatCoins(price)}`}
              style={styles.actionButton}
            />
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    body: { gap: theme.space[2], paddingBottom: theme.space[2] },
    // Same tracked-caption treatment as the wallet's confirm-transfer sheet.
    label: {
      color: theme.colors.mutedForeground,
      fontSize: theme.text.xs,
      fontWeight: theme.weight.emphasis,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginTop: theme.space[3],
    },
    itemTitle: { color: theme.colors.foreground, fontSize: theme.text.base, fontWeight: theme.weight.emphasis },
    price: { color: theme.colors.foreground, fontSize: theme.text.xl, fontWeight: theme.weight.heading },
    balanceLoading: { marginTop: theme.space[3] },
    balanceRows: { gap: theme.space[1], marginTop: theme.space[3] },
    row: { flexDirection: "row", justifyContent: "space-between" },
    rowLabel: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    rowValue: { color: theme.colors.foreground, fontSize: theme.text.sm, fontWeight: theme.weight.label },
    negative: { color: theme.colors.danger },
    hint: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    error: { color: theme.colors.danger, fontSize: theme.text.sm, marginTop: theme.space[2] },
    actions: { flexDirection: "row", gap: theme.space[3], marginTop: theme.space[3] },
    actionButton: { flex: 1 },
  });
}
