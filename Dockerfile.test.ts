import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync(new URL("./Dockerfile", import.meta.url), "utf8");
const deployWorkflowPath = new URL("./.github/workflows/deploy.yml", import.meta.url);
const hasDeployWorkflow = existsSync(deployWorkflowPath);
const workflow = hasDeployWorkflow ? readFileSync(deployWorkflowPath, "utf8") : "";

function stage(name: string): string {
  const stages = dockerfile.split(/^FROM .+ AS /m);
  const found = stages.find((s) => s.startsWith(name));
  if (found === undefined) throw new Error(`no such Dockerfile stage: ${name}`);
  return found;
}

describe("development stage", () => {
  it("starts from the full dependency tree and runs in development mode", () => {
    expect(dockerfile).toMatch(/^FROM deps AS dev$/m);
    expect(stage("dev")).toMatch(/^ENV NODE_ENV=development$/m);
  });
});

describe("build metadata (APP_COMMIT)", () => {
  it.skipIf(!hasDeployWorkflow)("is passed as a build arg by the deploy workflow", () => {
    expect(workflow).toMatch(/APP_COMMIT=\$\{\{\s*github\.sha\s*\}\}/);
  });

  it("is declared in the build stage so prerendered pages carry it", () => {
    const build = stage("build");
    expect(build).toMatch(/^ARG APP_COMMIT/m);
    expect(build).toMatch(/APP_COMMIT=\$\{?APP_COMMIT\}?/);
  });

  it("is declared in the runtime stage so dynamic pages carry it", () => {
    const runtime = stage("runtime");
    expect(runtime).toMatch(/^ARG APP_COMMIT/m);
    expect(runtime).toMatch(/^ENV APP_COMMIT=\$\{APP_COMMIT\}/m);
  });

  it("declares the runtime stamp after the COPY layers so a new SHA cannot bust their cache", () => {
    const runtime = stage("runtime");
    expect(runtime.indexOf("ARG APP_COMMIT")).toBeGreaterThan(runtime.lastIndexOf("\nCOPY "));
  });
});

describe("runtime dependencies", () => {
  it("takes only node_modules from the prod-deps source, leaving the pnpm store and caches behind", () => {
    expect(dockerfile).toMatch(/^FROM \$\{PROD_DEPS_IMAGE:-prod-deps\} AS prod-deps-src$/m);
    expect(dockerfile).toMatch(/^FROM base AS runtime$/m);
    expect(stage("runtime")).toMatch(
      /^COPY --from=prod-deps-src \/app\/node_modules \.\/node_modules$/m,
    );
  });
});
