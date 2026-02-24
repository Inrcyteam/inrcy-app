import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  // Base Next configs
  ...nextVitals,
  ...nextTs,

  // Override default ignores of eslint-config-next + add test artifacts
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
  ]),

  // Global tuning: keep quality, but don't hard-fail CI for "any"/unused vars
  {
    rules: {
      // Many Next apps still need <img> in a few spots; keep as warning
      "@next/next/no-img-element": "warn",

      // Don't block CI for pragmatic typing; still visible in PRs
      "@typescript-eslint/no-explicit-any": "warn",

      // Avoid blocking CI for unused vars; ignore _prefixed args/vars
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // API routes: allow pragmatic typing (route handlers frequently deal with unknown payloads)
  {
    files: ["app/api/**/*.ts", "app/api/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;