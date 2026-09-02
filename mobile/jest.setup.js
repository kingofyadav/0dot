// M9: react-native-reanimated tries to load real native module bindings on
// import, which don't exist under Jest's Node environment. The package's
// own official mock (react-native-reanimated/mock) turned out to be broken
// for this installed version (4.5.1, react-native-worklets-based): its
// mock.ts re-imports a handful of utilities directly from its own
// './index', which resolves to a different absolute path than the
// "react-native-reanimated" specifier jest.mock intercepts here — so that
// internal import bypasses the mock and hits the real native loader
// anyway. Rather than depend on that fragile internal detail, this is a
// minimal hand-written mock covering only what this codebase's components
// actually use (Button, ListRow, BottomSheet, ConversationRow's swipe) —
// narrower than the official mock, but not subject to its bug.
jest.mock("react-native-reanimated", () => {
  // jest.mock's factory must be self-contained (no outer-scope references,
  // since Jest hoists it above imports) — requiring inline here is the
  // standard pattern this repo's own test files already use for the same
  // reason.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View, Text, FlatList, ScrollView } = require("react-native");

  function useSharedValue(initial) {
    return { value: initial };
  }
  // Not reactive (mutating .value later doesn't re-render) — fine here,
  // since these tests assert on behavior (which functions got called with
  // what args), never on a computed animated style value.
  function useAnimatedStyle(factory) {
    return factory();
  }
  function useReducedMotion() {
    return false;
  }
  // BottomSheet lifts itself by the live keyboard height; under Jest there
  // is no keyboard, so a static zero-height shared value is enough — the
  // sheet tests assert on send/confirm behavior, never on its offset.
  function useAnimatedKeyboard() {
    return { height: { value: 0 }, state: { value: 0 } };
  }
  // react-native-gesture-handler's GestureDetector calls this internally
  // (to wire its native event stream to worklet handlers) regardless of
  // whether a gesture actually needs a Reanimated-driven style — it just
  // needs to exist and return a stable no-op under Jest.
  function useEvent() {
    return () => {};
  }
  function useAnimatedScrollHandler() {
    return () => {};
  }
  function withSpring(toValue) {
    return toValue;
  }
  function withTiming(toValue) {
    return toValue;
  }
  // Skeleton's shimmer/pulse loop (M15) — under Jest there's no animation
  // frame loop, so this just resolves to the target value like the others.
  function withRepeat(animation) {
    return animation;
  }
  function createAnimatedComponent(Component) {
    return Component;
  }
  // No real UI/JS thread split under Jest — calling straight through is
  // equivalent and keeps gesture-callback tests synchronous.
  function runOnJS(fn) {
    return (...args) => fn(...args);
  }

  // Layout-animation builders (FadeIn / FadeInDown / …) used for the
  // pre-login screens' entrance transitions. Real Reanimated exposes them
  // as chainable builder objects (`FadeInDown.duration(400).delay(80)`);
  // under Jest there's no animation loop, so a self-returning stub covers
  // every chained call and the `entering={…}` prop is ignored by the
  // plain View the mock substitutes for Animated.View.
  function makeLayoutAnimStub() {
    const stub = new Proxy(
      {},
      {
        get: () => () => stub,
      }
    );
    return stub;
  }
  const FadeIn = makeLayoutAnimStub();
  const FadeInDown = makeLayoutAnimStub();
  const FadeInUp = makeLayoutAnimStub();
  const FadeOut = makeLayoutAnimStub();

  return {
    __esModule: true,
    default: { View, Text, FlatList, ScrollView, createAnimatedComponent },
    useSharedValue,
    useAnimatedStyle,
    useReducedMotion,
    useAnimatedKeyboard,
    useEvent,
    useAnimatedScrollHandler,
    withSpring,
    withTiming,
    withRepeat,
    runOnJS,
    interpolate: () => 0,
    Extrapolation: { CLAMP: "clamp", EXTEND: "extend", IDENTITY: "identity" },
    FadeIn,
    FadeInDown,
    FadeInUp,
    FadeOut,
  };
});

// react-native-gesture-handler ships its own official jest mock, which
// (unlike reanimated's above) works as documented for the installed
// version — no equivalent workaround needed.
import "react-native-gesture-handler/jestSetup";

// M12: theme.ts now pulls in themePreferences.tsx (ThemePreferencesProvider),
// which reads AsyncStorage — previously nothing reachable from any test's
// import graph touched this package (onboarding.ts's own AsyncStorage usage
// never got test coverage), so no mock was needed until now. The package's
// real native module is null under Jest's Node environment; its own
// official mock is what the library's docs point to for this exact error.
// `mock`-prefixed import, not require() — babel-plugin-jest-hoist exempts
// "mock"-prefixed identifiers from jest.mock()'s usual "no outer-scope
// reference" restriction (same fix wallet.test.tsx's own comment documents).
import mockAsyncStorage from "@react-native-async-storage/async-storage/jest/async-storage-mock";

jest.mock("@react-native-async-storage/async-storage", () => mockAsyncStorage);
