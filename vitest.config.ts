import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { classifyTests } from "./vitest.classify.ts";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

const { unit, integration } = classifyTests(ROOT);

export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    environment: "node",
    exclude: ["**/node_modules/**", "**/testHarness.test.ts"],
    projects: [
      {
        extends: true,
        test: { name: "unit", include: unit },
      },
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
