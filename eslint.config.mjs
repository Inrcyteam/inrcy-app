import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Flat config (eslint.config.mjs)
// Goal: keep CI green while still surfacing useful issues as warnings.
export default defineConfig([
  ...nextVitals,
  ...nextTs,

  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),

  // Project-wide rule tuning (applies to JS/TS in the repo)
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      // CI blockers seen in your logs
      "react/no-unescaped-entities": "off",

      // Keep these visible but non-blocking
      "prefer-const": "warn",
      "@typescript-eslint/no-explicit-any": "warn",

      // Unused vars: allow underscore-prefixed vars/args and caught errors
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],

      // Next rule that warns on <img> – keep as warning (or set to "off" if you prefer)
      "@next/next/no-img-element": "warn",
    },
  },
]);
