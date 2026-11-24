import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const DB_MARKER =
  /@\/test\/db|@\/db\/testing|makeTestDb|withTestDb|test-helpers|testHarness|@testcontainers\//;

function collectTests(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
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
