import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // react-hooks/immutability (part of core-web-vitals' React Compiler
  // ruleset) flags every `sharedValue.value = x` as mutating a
  // hook-returned value — but that assignment is react-native-reanimated's
  // documented, load-bearing API for driving UI-thread animations, not a
  // mistake; there's no alternative form to rewrite it into. Scoped to all
  // of mobile/ rather than the specific files using it today, since any
  // future Reanimated usage anywhere in that app hits the same rule/
  // library incompatibility, not just this pass's four call sites.
  {
    files: ["mobile/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/immutability": "off",
    },
  },
  // Server Actions bound to useActionState always receive (prevState,
  // formData), even when a given action doesn't need one or either (e.g.
  // session-driven actions that ignore formData entirely) — the `_`-prefix
  // convention already marks these as intentionally unused throughout
  // src/app/actions/*.ts; this just makes the linter honor it instead of
  // only accidentally staying quiet when a later positional arg happens to
  // be used (@typescript-eslint/no-unused-vars' default "after-used" mode).
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  // Expo config plugins (mobile/plugins/*.js) are CommonJS build-time
  // scripts run by @expo/config-plugins during `expo prebuild`, not app
  // code — `require()` is the only module form they support.
  {
    files: ["mobile/plugins/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
