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
  "react/no-unescaped-entities": "off",

  "prefer-const": "warn",
  "@typescript-eslint/no-explicit-any": "warn",
  "@typescript-eslint/prefer-as-const": "warn",

  // ✅ AJOUT CRITIQUE
  "no-unused-vars": [
    "warn",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
      ignoreRestSiblings: true,
    },
  ],

  "@typescript-eslint/no-unused-vars": [
    "warn",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
      ignoreRestSiblings: true,
    },
  ],

  "@next/next/no-img-element": "warn",
},
  },
]);
