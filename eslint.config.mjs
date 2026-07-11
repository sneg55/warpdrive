// @ts-check

import nextPlugin from "@next/eslint-plugin-next";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import comments from "eslint-plugin-eslint-comments";
import importX from "eslint-plugin-import-x";
import reactHooks from "eslint-plugin-react-hooks";
import security from "eslint-plugin-security";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

// Core no-restricted-syntax bans that apply to all app code.
const CORE_RESTRICTED_SYNTAX = [
  {
    selector: "ThrowStatement > NewExpression[callee.name='Error']",
    message: "Throw AppError(id, ...) instead of raw Error (src/constants/errorIds.ts).",
  },
  {
    selector: "CallExpression[callee.name='fetch'][arguments.length<2]",
    message: "fetch() must pass { signal } for cancellation (see AbortSignal convention).",
  },
];

// Design-system enforcement (CLAUDE.md "Use the design system, never reinvent"). New code must
// use the shadcn primitives, not hand-roll these surfaces. The 2026-07-05 migration converted all
// prior offenders to DropdownMenu/Dialog, so the ban now applies everywhere (only the shadcn
// wrappers under src/components/ui/** are exempt, since they ARE the sanctioned implementations).
const DESIGN_SYSTEM_RESTRICTED_SYNTAX = [
  {
    selector: "ImportDeclaration[source.value='@/components/useMenuDismiss']",
    message:
      "Hand-rolled dropdown menus are banned. Use the shadcn DropdownMenu primitive (src/components/ui/dropdown-menu.tsx) instead of useMenuDismiss.",
  },
  {
    selector: "Literal[value=/fixed inset-0/]",
    message:
      "Hand-rolled modal overlays are banned. Use the shadcn Dialog primitive (src/components/ui/dialog.tsx) instead of a `fixed inset-0` overlay.",
  },
];

export default tseslint.config(
  {
    // Exclude build artifacts, generated output, and dev-only parity analysis scripts.
    ignores: ["drizzle/**", ".next/**", "node_modules/**", "**/parity-tools/**"],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Allow files outside tsconfig.json to be parsed with the default project:
          // - *.mjs: ESLint config file itself (postcss.config.mjs etc.)
          // - src/features/demo/*.ts: virtual in-memory file paths used in lint tests
          allowDefaultProject: [
            "*.mjs",
            "scripts/*.mjs",
            ".env.example.test.ts",
            "src/features/demo/*.ts",
          ],
        },
      },
    },
    plugins: {
      "import-x": importX,
      sonarjs,
      security,
      "eslint-comments": comments,
      // Rules of hooks + exhaustive-deps had never run against the ~226 client components; Next's
      // own plugin catches <img>/<a> misuse the framework has purpose-built replacements for.
      "react-hooks": reactHooks,
      "@next/next": nextPlugin,
    },
    settings: {
      "import-x/resolver-next": [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
        }),
      ],
    },
    rules: {
      // --- React hooks + Next.js ---
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      // Duplicates biome's lint/performance/noImgElement, which already guards these and carries
      // the per-site `biome-ignore` explaining why the three fixed-size avatars stay <img>. Two
      // linters cannot both own the comment line directly above the element.
      "@next/next/no-img-element": "off",

      // --- TypeScript type-aware rules ---
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

      // --- Import rules (eslint-plugin-import-x, ESLint 10 compatible) ---
      // no-unresolved is off: TypeScript's own resolver catches these at compile time
      // and import-x resolver-next config can silently miss path aliases in some setups.
      "import-x/no-unresolved": "off",
      "import-x/no-cycle": "error",

      // --- Code quality ---
      "sonarjs/cognitive-complexity": ["error", 15],

      // --- Console ---
      "no-console": ["error", { allow: ["warn", "error"] }],

      // --- Custom project rules ---

      // Ban raw process.env outside the single env boundary.
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Read env only via src/config/env.ts",
        },
      ],

      // Ban raw throw new Error (use AppError), fetch without signal, and hand-rolled
      // menus/modals (design-system enforcement). See the const definitions above.
      "no-restricted-syntax": [
        "error",
        ...CORE_RESTRICTED_SYNTAX,
        ...DESIGN_SYSTEM_RESTRICTED_SYNTAX,
      ],
    },
  },

  // The design-system primitives ARE the sanctioned home for these patterns: dialog.tsx uses
  // `fixed inset-0` for its overlay. Keep core bans, drop the design-system ones.
  {
    files: ["src/components/ui/**"],
    rules: {
      "no-restricted-syntax": ["error", ...CORE_RESTRICTED_SYNTAX],
    },
  },

  // The env boundary is the one place process.env is legitimately read and
  // where a raw Error throw at boot time is intentional (fails fast before
  // AppError's domain system is available).
  {
    files: ["src/config/env.ts"],
    rules: {
      "no-restricted-properties": "off",
      "no-restricted-syntax": "off",
    },
  },

  // clientEnv.ts is the NEXT_PUBLIC_* counterpart of env.ts: it is the single
  // place browser-safe env vars are read. process.env is required here because
  // Next.js inlines NEXT_PUBLIC_* vars as literals at build time.
  {
    files: ["src/config/clientEnv.ts"],
    rules: {
      "no-restricted-properties": "off",
    },
  },

  // instrumentation.ts is the server boot entry. It reads NEXT_RUNTIME (Next-injected
  // framework metadata, not app config) so the edge runtime can bail out before the
  // node-only env module is imported. That single read is exempt from the env boundary.
  {
    files: ["src/instrumentation.ts"],
    rules: {
      "no-restricted-properties": "off",
    },
  },

  // assertNever in result.ts is a programmer-error guard that legitimately
  // throws a raw Error. errorIds.ts declares AppError itself so it cannot
  // import AppError from itself.
  {
    files: ["src/types/result.ts", "src/constants/errorIds.ts"],
    rules: { "no-restricted-syntax": "off" },
  },

  // Tooling config files run outside the app (no env.ts, no AppError available).
  // They use process.env directly by necessity and are not app code.
  {
    files: [
      "next.config.ts",
      "drizzle.config.ts",
      "vitest.config.ts",
      "postcss.config.mjs",
      "eslint.config.mjs",
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

  // scripts/** are standalone dev-tooling programs that run outside the Next.js
  // app process. They use process.env and console.warn/error directly (no app
  // env.ts or AppError available without pulling in all required env vars).
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

  // scripts/**/*.mjs: same standalone-tooling rationale, but plain JS (no types), so the
  // type-aware conditionals rule and console policy don't fit either. CLI programs whose
  // stdout IS the product (parity gate reports) may use console.log.
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

  // vitest.setup.ts seeds process.env for the test harness: process.env access
  // is intentional here, and it runs before app modules load.
  {
    files: ["vitest.setup.ts"],
    rules: {
      "no-restricted-properties": "off",
      "@typescript-eslint/strict-boolean-expressions": "off",
    },
  },

  // Test files, and the test-only helpers under src/test/**, relax rules that conflict with
  // idiomatic test patterns. src/test/** never ships: it is the Postgres harness and assertion
  // helpers, so a raw throw there is a test failure, not an app error path.
  // - no-unnecessary-condition: narrowing via `if (r.ok)` is intentional in tests
  // - no-non-null-assertion: test assertions often use ! for clarity
  // - no-restricted-syntax: tests may throw raw errors to verify error paths
  // - no-unsafe-*: ESLint API types return `any` for rule configs; acceptable in tests
  // Note: the process.env ban (no-restricted-properties) stays ON for test files;
  // only src/config/env.test.ts is exempted explicitly below.
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

  // env.test.ts spreads process.env to build production-config test inputs for
  // parseEnv. This is the ONLY test file that needs raw process.env; the ban
  // stays in force for all other test files. Placed last so it wins.
  {
    files: ["src/config/env.test.ts"],
    rules: { "no-restricted-properties": "off" },
  },
);
