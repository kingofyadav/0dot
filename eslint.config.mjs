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
  // Forces new server-side logging through src/lib/logger.ts (which tags a
  // level and forwards error/warning to Sentry) instead of scattering raw
  // console calls that emit no consistent shape and never reach Sentry. A
  // warning, not an error: ~50 pre-existing call sites (src/lib, src/app/
  // actions, src/app/api) predate this rule and aren't migrated yet, so
  // flipping this to "error" would fail every existing PR that touches
  // those files. Tighten to "error" once that backlog is cleared.
  {
    files: ["src/app/**/*.{ts,tsx}", "src/lib/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    ignores: [
      "src/lib/logger.ts", // the one file allowed to call console directly — everything else routes through it
      "src/components/ConsoleSelfXssWarning.tsx", // deliberately prints a user-facing security banner, not a dev log — must NOT go through logger (that would fire a Sentry alert every page load)
      "**/__tests__/**",
    ],
    rules: {
      "no-console": "warn",
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
