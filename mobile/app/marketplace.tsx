import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import * as WebBrowser from "expo-web-browser";
import { useFocusEffect } from "expo-router";
import { getMarketplace, ApiError } from "../src/api/client";
import { Card } from "../src/components/Card";
import { EmptyState } from "../src/components/EmptyState";
import { SegmentedControl } from "../src/components/SegmentedControl";
import { FeedRowSkeleton } from "../src/components/Skeleton";
import { haptics } from "../src/utils/haptics";
import { usePressScale } from "../src/utils/usePressScale";
import { useContentMaxWidth } from "../src/utils/responsive";
import { API_BASE_URL } from "../src/config";
import { useTheme, type Theme } from "../src/theme";
import type { MarketplaceCategory, MarketplaceItem } from "../src/api/types";

type TabKey = "all" | MarketplaceCategory;
const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "theme", label: "Themes" },
  { key: "template", label: "Templates" },
  { key: "app", label: "Apps" },
  { key: "course", label: "Courses" },
  { key: "digital_product", label: "Digital products" },
  { key: "freelance_service", label: "Services" },
];

// Detail/purchase stays a browser hand-off (each item's own `href`) — see
// GET /api/v1/marketplace's own comment for why this is browse-only.
export default function MarketplaceScreen() {
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [tab, setTab] = useState<TabKey>("all");
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (category: TabKey) => {
    setError(null);
    try {
      const result = await getMarketplace(category === "all" ? null : category);
      setItems(result.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the marketplace.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        await load(tab);
        setLoading(false);
      })();
    }, [load, tab])
  );

  async function onRefresh() {
    setRefreshing(true);
    haptics.light();
    await load(tab);
    setRefreshing(false);
  }

  function onOpenItem(href: string) {
    haptics.light();
    WebBrowser.openBrowserAsync(`${API_BASE_URL}${href}`).catch(() => {});
  }

  return (
    <View style={[styles.screen, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}>
      <View style={styles.tabsWrap}>
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      </View>
      {loading ? (
        <View style={styles.flex}>
          {[0, 1, 2].map((i) => (
            <FeedRowSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          style={styles.flex}
          contentContainerStyle={styles.list}
          data={items}
          keyExtractor={(item) => `${item.category}-${item.id}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
          ListEmptyComponent={<EmptyState icon={error ? "cloud-offline-outline" : "bag-outline"} message={error ?? "Nothing here yet."} />}
          renderItem={({ item }) => (
            <MarketplaceItemCard item={item} styles={styles} onOpen={() => onOpenItem(item.href)} />
          )}
        />
      )}
    </View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Extracted so usePressScale (a hook) has a proper component to live in —
// FlatList's renderItem is called per-row, not a place hooks can go
// directly. Gives marketplace item cards the same press-spring feedback
// every other tappable row in the app now has, instead of the plain
// opacity dip this one previously used.
function MarketplaceItemCard({
  item,
  styles,
  onOpen,
}: {
  item: MarketplaceItem;
  styles: ReturnType<typeof createStyles>;
  onOpen: () => void;
}) {
  const { animatedStyle, onPressIn, onPressOut } = usePressScale({ scale: 0.97, opacity: 0.85 });
  return (
    <AnimatedPressable
      onPress={onOpen}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.title}`}
      style={animatedStyle}
    >
      <Card style={styles.card} elevated={false}>
        <Text style={styles.categoryLabel}>{item.categoryLabel}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {item.subtitle}
        </Text>
        <Text style={styles.price}>{item.priceLabel}</Text>
      </Card>
    </AnimatedPressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    flex: { flex: 1 },
    tabsWrap: { paddingVertical: theme.space[3] },
    list: { paddingHorizontal: theme.space[4], gap: theme.space[3] },
    card: { gap: 2 },
    categoryLabel: { color: theme.colors.accent, fontSize: theme.text.xs, fontWeight: theme.weight.emphasis, textTransform: "uppercase" },
    title: { color: theme.colors.foreground, fontSize: theme.text.base, fontWeight: theme.weight.emphasis },
    subtitle: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    price: { color: theme.colors.foreground, fontSize: theme.text.sm, fontWeight: theme.weight.label, marginTop: theme.space[1] },
  });
}
