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
