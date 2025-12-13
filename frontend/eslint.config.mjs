import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Architecture boundary enforcement
  {
    name: "architecture-boundaries",
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            // Prevent deep imports into feature internals
            {
              group: [
                "@/features/*/domain/*",
                "@/features/*/services/*",
                "@/features/*/state/*",
                "@/features/*/ui/*",
              ],
              message:
                "Import from feature root (@/features/featureName) instead of internal modules.",
            },
            // Deprecated: Old scattered locations
            {
              group: ["@/apis/chat.api", "@/apis/session.api"],
              message: "Deprecated. Import from @/features/chat instead.",
            },
            {
              group: ["@/hooks/useChat", "@/hooks/useSessions"],
              message: "Deprecated. Import from @/features/chat instead.",
            },
            {
              group: ["@/types/chat.types"],
              message: "Deprecated. Import from @/features/chat instead.",
            },
            {
              group: ["@/components/chat/*"],
              message: "Deprecated. Import from @/features/chat instead.",
            },
          ],
        },
      ],
    },
  },
  // Prevent council feature from importing chat feature
  {
    name: "council-feature-isolation",
    files: ["src/features/council/**/*"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/chat", "@/features/chat/**"],
              message:
                "Council feature cannot import from chat feature. Use shared/ for common code.",
            },
          ],
        },
      ],
    },
  },
  // Prevent chat feature from importing council feature
  {
    name: "chat-feature-isolation",
    files: ["src/features/chat/**/*"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/council", "@/features/council/**"],
              message:
                "Chat feature cannot import from council feature. Use shared/ for common code.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
