import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

// TypeScript's wildcard includes skip directories whose name starts with a dot, so anything under
// src/app/.well-known needs an explicit entry. Without one it still resolves on a developer machine,
// because `.next/types/routes.d.ts` references those routes and `.next/types/**/*.ts` IS included,
// which hides the hole: a clean checkout (CI) drops the files from the program, and typed linting
// then fails with "not found by the project service" on a tree that lints clean locally.
//
// So the program is resolved here WITHOUT the .next entries, which is what CI actually has.
function fileNamesWithoutBuildArtifacts(): string[] {
  const raw = ts.readConfigFile(`${ROOT}tsconfig.json`, (p) => readFileSync(p, "utf8"));
  expect(raw.error).toBeUndefined();
  const config = raw.config as { include?: string[] };
  const include = (config.include ?? []).filter((entry) => !entry.startsWith(".next"));
  const parsed = ts.parseJsonConfigFileContent({ ...config, include }, ts.sys, ROOT);
  expect(parsed.errors.filter((e) => e.category === ts.DiagnosticCategory.Error)).toEqual([]);
  return parsed.fileNames.map((f) => f.replace(ROOT, ""));
}

describe("tsconfig file coverage", () => {
  it("covers routes in dot-directories, which wildcard includes silently skip", () => {
    const files = fileNamesWithoutBuildArtifacts();
    expect(files).toContain("src/app/.well-known/oauth-authorization-server/route.ts");
    expect(files).toContain("src/app/.well-known/oauth-protected-resource/route.ts");
  });
});
