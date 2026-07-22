// Flat ESLint config (ESLint 9) covering the TypeScript-only workspaces:
// packages/* and apps/api. apps/admin-web and apps/mobile-pwa each carry
// their own eslint.config.mjs (Next.js's flat-config-compatible rule set),
// which ESLint 9 resolves independently by stopping at the nearest config
// file rather than cascading from the root.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "apps/admin-web/**", "apps/mobile-pwa/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
);
