import { ScrollView, StyleSheet } from "react-native";
import { Chip } from "./Chip";

type Option<T extends string> = { key: T; label: string };

// A horizontally-scrolling row of Chips acting as a single-select tab
// strip — built for Explore's Users/Posts search-result tabs, generic
// enough to reuse for any later "pick one of a few categories" UI
// (marketplace category, event when-filter) without a second component.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map((option) => (
        <Chip key={option.key} label={option.label} selected={option.key === value} onPress={() => onChange(option.key)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
});
