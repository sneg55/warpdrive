import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

const pkg = JSON.parse(read("./package.json")) as { packageManager?: string; pnpm?: unknown };
const workspacePath = new URL("./pnpm-workspace.yaml", import.meta.url);
const workspace = existsSync(workspacePath) ? readFileSync(workspacePath, "utf8") : "";
const dockerfile = read("./Dockerfile");
const workflowPath = new URL("./.github/workflows/deploy.yml", import.meta.url);
const hasWorkflow = existsSync(workflowPath);
const workflow = hasWorkflow ? readFileSync(workflowPath, "utf8") : "";

const PINNED_PNPM = /^pnpm@(\d+\.\d+\.\d+)$/;

function pinnedVersion(): string {
  const match = PINNED_PNPM.exec(pkg.packageManager ?? "");
  if (match?.[1] === undefined) throw new Error(`unpinned packageManager: ${pkg.packageManager}`);
  return match[1];
}

function stage(name: string): string {
  const found = dockerfile.split(/^FROM .+ AS /m).find((s) => s.startsWith(name));
  if (found === undefined) throw new Error(`no such Dockerfile stage: ${name}`);
  return found;
}

describe("pnpm configuration", () => {
  it("pins pnpm 12", () => {
    expect(pinnedVersion()).toMatch(/^12\./);
  });

  it("keeps no settings in the package.json pnpm field, which pnpm 11+ silently ignores", () => {
    expect(pkg.pnpm).toBeUndefined();
  });

  it("carries the dependency overrides in pnpm-workspace.yaml", () => {
    expect(workspace).toMatch(/^overrides:$/m);
    expect(workspace).toMatch(/^ {2}"?proxy-addr@<2\.0\.8"?: "?\^2\.0\.8"?$/m);
  });

  it.each([
    "deps",
    "prod-deps",
  ])("copies pnpm-workspace.yaml into the %s stage before installing", (name) => {
    const body = stage(name);
    const copy = /^COPY .*pnpm-workspace\.yaml.*$/m.exec(body);
    expect(copy).not.toBeNull();
    expect(body.indexOf(copy?.[0] ?? "")).toBeLessThan(body.indexOf("pnpm install"));
  });

  it.each([
    "site",
    "docs-site",
  ])("gives %s its own workspace root so pnpm there never adopts the app's settings", (dir) => {
    const own = read(`./${dir}/pnpm-workspace.yaml`);
    expect(own).toMatch(/^packages:\n {2}- "\."$/m);
  });

  it.skipIf(!hasWorkflow)("sets up the same pnpm version in CI as package.json pins", () => {
    const versions = [
      ...workflow.matchAll(/pnpm\/action-setup@v\d+\n\s+with:\n\s+version: (\S+)/g),
    ];
    expect(versions.length).toBeGreaterThan(0);
    for (const [, version] of versions) expect(version).toBe(pinnedVersion());
  });

  it.skipIf(!hasWorkflow)("uses a pnpm/action-setup major that can install pnpm 12", () => {
    const majors = [...workflow.matchAll(/pnpm\/action-setup@v(\d+)/g)].map(([, m]) => Number(m));
    expect(majors.length).toBeGreaterThan(0);
    for (const major of majors) expect(major).toBeGreaterThanOrEqual(6);
  });
});
