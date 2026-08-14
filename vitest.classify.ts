import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// A test file is "integration" if it needs a container runtime, directly or via a *.test-helpers
// file that does. Everything else is a "unit" test that runs with NO container.
//
// The marker is conservative (any harness/helper reference => integration), so a DB test can never
// land in the container-less unit lane; new DB tests classify automatically since they import the
// harness. This split lets `test:unit` run with no Docker, which is what makes it runnable on the
// self-hosted k8s-prod pool.
//
// The last alternative matches direct testcontainers use. Without it a file that builds its own
// container instead of going through the shared harness (src/db/migrate.test.ts did) silently lands
// in the unit lane, where it only passes because the runner image happens to ship Docker.
export const DB_MARKER =
  /@\/test\/db|@\/db\/testing|makeTestDb|withTestDb|test-helpers|testHarness|@testcontainers\//;

// Walk the repo (skipping node_modules and dot-dirs) so root-level meta-tests like
// eslint.config.test.ts are classified too, matching the old project-wide glob.
export function collectTests(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules and dot-dirs (.git/.next/...); dot-FILES like .env.example.test.ts stay.
      // Skip the `site` and `docs-site` sub-apps too: each is a self-contained package with its own
      // config and module resolution, so sweeping them into this project resolves imports against
      // the wrong root and breaks collection. They run via `pnpm -C <dir> test`.
      if (
        entry.name === "node_modules" ||
        entry.name === "site" ||
        entry.name === "docs-site" ||
        entry.name.startsWith(".")
      )
        continue;
      collectTests(full, acc);
    } else if (/\.test\.tsx?$/.test(entry.name) && entry.name !== "testHarness.test.ts") {
      acc.push(full);
    }
  }
  return acc;
}

export function classifyTests(root: string): { unit: string[]; integration: string[] } {
  const unit: string[] = [];
  const integration: string[] = [];
  for (const file of collectTests(root)) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    (DB_MARKER.test(readFileSync(file, "utf8")) ? integration : unit).push(rel);
  }
  return { unit, integration };
}
