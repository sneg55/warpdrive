import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

// A test file is "integration" if it touches the real Postgres harness, directly or via a
// *.test-helpers file that does. Everything else is a "unit" test that runs with NO container.
// The marker is conservative (any harness/helper reference => integration), so a DB test can never
// land in the container-less unit lane; new DB tests classify automatically since they import the
// harness. This split lets `test:unit` run instantly with no Docker.
const DB_MARKER = /@\/test\/db|@\/db\/testing|makeTestDb|withTestDb|test-helpers|testHarness/;

// Walk the repo (skipping node_modules and dot-dirs) so root-level meta-tests like
// eslint.config.test.ts are classified too, matching the old project-wide glob.
function collectTests(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules and dot-dirs (.git/.next/...); dot-FILES like .env.example.test.ts stay.
      // Skip the `site` sub-app too: it is a self-contained package with its own vitest.config.ts
      // and `@` -> `site/src` alias, so sweeping it into this project resolves `@` to the wrong root
      // and breaks collection. Its tests run via `pnpm -C site test`.
      if (entry.name === "node_modules" || entry.name === "site" || entry.name.startsWith("."))
        continue;
      collectTests(full, acc);
    } else if (/\.test\.tsx?$/.test(entry.name) && entry.name !== "testHarness.test.ts") {
      acc.push(full);
    }
  }
  return acc;
}

const unit: string[] = [];
const integration: string[] = [];
for (const file of collectTests(ROOT)) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  (DB_MARKER.test(readFileSync(file, "utf8")) ? integration : unit).push(rel);
}

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
