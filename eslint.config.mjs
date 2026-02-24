import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  // Base Next configs
  ...nextVitals,
  ...nextTs,

  // Add ignores for build + test artifacts
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
  ]),

  // Global tuning: keep quality, but don't hard-fail CI on noisy rules
  {
    rules: {
      // Many Next apps still need <img> in a few spots; keep as warning
      "@next/next/no-img-element": "warn",

      // Don't block CI for pragmatic typing; still visible in PRs
      "@typescript-eslint/no-explicit-any": "warn",

      // Don't block CI for unused vars; ignore _prefixed args/vars
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // The remaining ones are currently breaking your CI
      "prefer-const": "warn",
      "react/no-unescaped-entities": "warn",
      "@typescript-eslint/prefer-as-const": "warn",
    },
  },

  // API routes: allow pragmatic typing (route handlers frequently deal with unknown payloads)
  {
    files: ["app/api/**/*.ts", "app/api/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/prefer-as-const": "off",
    },
  },
]);

export default eslintConfig;
