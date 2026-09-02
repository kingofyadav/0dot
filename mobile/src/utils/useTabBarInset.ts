import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";

// M15/D2: the tab bar is now `position: "absolute"` translucent glass, so
// content on the 5 tab-root screens (index/explore/messages/notifications/
// profile) scrolls under it and needs a matching bottom inset on its
// scroll content — otherwise the last row sits permanently behind the bar.
// This is the one place the M15 pass necessarily reaches past "chrome +
// components + 2 flagships"; each screen adds one `contentContainerStyle`
// entry from this. `useBottomTabBarHeight()` (react-navigation's own hook,
// already a transitive dependency through expo-router's Tabs) reads the
// live measured bar height, which already includes the device's bottom
// safe-area inset — expo-router re-exports it only from this build path.
export function useTabBarContentPadding(): { paddingBottom: number } {
  return { paddingBottom: useBottomTabBarHeight() };
}
