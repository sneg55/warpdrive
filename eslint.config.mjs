// @ts-check

import nextPlugin from "@next/eslint-plugin-next";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import comments from "eslint-plugin-eslint-comments";
import importX from "eslint-plugin-import-x";
import reactHooks from "eslint-plugin-react-hooks";
import security from "eslint-plugin-security";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";
import { noCommentsPlugin } from "./eslint.no-comments.mjs";
import {
  CORE_RESTRICTED_SYNTAX,
  DESIGN_SYSTEM_RESTRICTED_SYNTAX,
} from "./eslint.restricted-syntax.mjs";

export default tseslint.config(
  {
    ignores: [
      "drizzle/**",
      ".next/**",
      "dist/**",
      "node_modules/**",
      "**/parity-tools/**",
      "site/**",
      "docs-site/**",
      ".claude/**",
      "next-env.d.ts",
    ],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "*.mjs",
            "scripts/*.mjs",
            ".env.example.test.ts",
            "src/features/demo/*.ts",
            "src/features/demo/*.tsx",
          ],
        },
      },
    },
    plugins: {
      "import-x": importX,
      sonarjs,
      security,
      "eslint-comments": comments,
      "react-hooks": reactHooks,
      "@next/next": nextPlugin,
      warpdrive: noCommentsPlugin,
    },
    settings: {
      "import-x/resolver-next": [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
        }),
      ],
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      "@next/next/no-img-element": "off",

      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/consistent-type-imports": "error",

      "import-x/no-unresolved": "off",
      "import-x/no-cycle": "error",

      "sonarjs/cognitive-complexity": ["error", 15],

      "no-console": ["error", { allow: ["warn", "error"] }],

      "warpdrive/no-comments": "error",

      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Read env only via src/config/env.ts",
        },
      ],

      "no-restricted-syntax": [
        "error",
        ...CORE_RESTRICTED_SYNTAX,
        ...DESIGN_SYSTEM_RESTRICTED_SYNTAX,
      ],
    },
  },

  {
    files: ["src/components/ui/**"],
    rules: {
      "no-restricted-syntax": ["error", ...CORE_RESTRICTED_SYNTAX],
    },
  },

  {
    files: ["src/config/env.ts"],
    rules: {
      "no-restricted-properties": "off",
      "no-restricted-syntax": "off",
    },
  },

  {
    files: ["src/instrumentation.ts"],
    rules: {
      "no-restricted-properties": "off",
    },
  },

  {
    files: ["src/types/result.ts", "src/constants/errorIds.ts"],
    rules: { "no-restricted-syntax": "off" },
  },

  {
    files: [
      "next.config.ts",
      "drizzle.config.ts",
      "vitest.config.ts",
      "postcss.config.mjs",
      "eslint.config.mjs",
      "eslint.restricted-syntax.mjs",
      "eslint.no-comments.mjs",
    ],
    rules: {
      "no-restricted-properties": "off",
      "no-restricted-syntax": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },

  {
    files: ["scripts/**/*.ts"],
    rules: {
      "no-restricted-properties": "off",
      "no-restricted-syntax": "off",
      "no-console": ["error", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },

  {
    files: ["scripts/**/*.mjs"],
    rules: {
      "no-restricted-properties": "off",
      "no-restricted-syntax": "off",
      "no-console": "off",
      "@typescript-eslint/strict-boolean-expressions": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },

  {
    files: ["vitest.setup.ts", "vitest.globalSetup.ts"],
    rules: {
      "no-restricted-properties": "off",
      "@typescript-eslint/strict-boolean-expressions": "off",
    },
  },

  {
    files: ["**/*.test.ts", "**/*.test.tsx", "*.test.ts", "*.test.tsx", "src/test/**/*.ts"],
    rules: {
      "no-restricted-syntax": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },

  {
    files: ["src/config/env.test.ts", "vitest.globalSetup.test.ts"],
    rules: { "no-restricted-properties": "off" },
  },
);
