import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { classifyTests } from "./vitest.classify";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

// Lane split lives in vitest.classify.ts so vitest.classify.test.ts can assert its contract:
// nothing in the unit lane may need a container runtime. See that file for the rules.
const { unit, integration } = classifyTests(ROOT);

export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Per-file environment overrides via @vitest-environment docblock in .test.tsx files.
    environment: "node",
    exclude: ["**/node_modules/**", "**/testHarness.test.ts"],
    projects: [
      // Unit lane: no globalSetup, so `vitest run --project unit` needs no Postgres/Docker at all.
      {
        extends: true,
        test: { name: "unit", include: unit },
      },
      // Integration lane: one shared container + migrated template (see vitest.globalSetup.ts).
      {
        extends: true,
        test: {
          name: "integration",
          include: integration,
          globalSetup: ["./vitest.globalSetup.ts"],
        },
      },
    ],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
