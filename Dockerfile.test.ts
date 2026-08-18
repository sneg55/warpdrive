import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The build stamp reaches the running app through three files that know nothing about each other:
// the workflow passes the SHA as a build arg, the Dockerfile declares it in the stage that runs
// `next build` (prerendered pages read it then) and in the runtime stage (dynamic pages read it at
// request time), and src/config/env.ts defaults it to "". Any one of them dropping out is silent:
// the app boots fine and just reports an empty commit, which is how prod ran unstamped.
const dockerfile = readFileSync(new URL("./Dockerfile", import.meta.url), "utf8");
const workflow = readFileSync(new URL("./.github/workflows/deploy.yml", import.meta.url), "utf8");

function stage(name: string): string {
  const stages = dockerfile.split(/^FROM .+ AS /m);
  const found = stages.find((s) => s.startsWith(name));
  if (found === undefined) throw new Error(`no such Dockerfile stage: ${name}`);
  return found;
}

describe("build metadata (APP_COMMIT)", () => {
  it("is passed as a build arg by the deploy workflow", () => {
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
