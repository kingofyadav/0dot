import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { relativeTime } from "../utils/relativeTime";
import { walletActivityLabel } from "../utils/walletActivityLabel";
import { useTheme, type Theme } from "../theme";
import type { WalletTransactionEntry } from "../api/types";

// Shared between the wallet screen's "recent activity" preview (business
// scope) and the full transaction-ledger screen — one row renderer so the
// two never drift.
export function WalletActivityRow({ entry }: { entry: WalletTransactionEntry }) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const isOut = entry.direction === "out";
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: isOut ? theme.colors.dangerSoft : theme.colors.successSoft }]}>
        <Ionicons name={isOut ? "arrow-up" : "arrow-down"} size={16} color={isOut ? theme.colors.danger : theme.colors.success} />
      </View>
      <View style={styles.body}>
        <Text style={styles.name}>{walletActivityLabel(entry)}</Text>
        <Text style={styles.time}>{relativeTime(entry.createdAt)}</Text>
      </View>
      <Text style={[styles.amount, { color: isOut ? theme.colors.danger : theme.colors.success }]}>
        {isOut ? "-" : "+"}
        {entry.amountCoins}
      </Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: theme.space[3], paddingVertical: theme.space[2] },
    icon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    body: { flex: 1, gap: 2 },
    name: { color: theme.colors.foreground, fontSize: theme.text.base, fontWeight: theme.weight.label },
    time: { color: theme.colors.mutedForeground, fontSize: theme.text.xs },
    amount: { fontSize: theme.text.base, fontWeight: theme.weight.emphasis },
  });
}
