import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

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
