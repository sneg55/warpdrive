import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const ci = readFileSync(new URL("./.gitlab-ci.yml", import.meta.url), "utf8");

const packageJson = z
  .object({ scripts: z.record(z.string(), z.string()) })
  .parse(JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")));

function blockOf(startLine: string): string {
  const lines = ci.split("\n");
  const start = lines.indexOf(startLine);
  if (start === -1) throw new Error(`no such block: ${startLine}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line !== undefined && /^[^\s#]/.test(line)) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

const job = (name: string): string => blockOf(`${name}:`);

describe("gitlab ci pipeline", () => {
  it("runs prepare, deps builds, tests, final build, final tests and tag in that order", () => {
    const stages = blockOf("stages:");
    const order = [
      "prepare",
      "build deps images",
      "test",
      "build final images",
      "final tests",
      "tag",
    ];
    let last = -1;
    for (const stage of order) {
      const index = stages.indexOf(`\n  - ${stage}\n`);
      expect(index, `stage "${stage}"`).toBeGreaterThan(last);
      last = index;
    }
  });

  it("exports the image tags from prepare to every later job", () => {
    const block = job("prepare");
    expect(block).toContain('echo "TAG=${TAG}" | tee -a build-env.txt');
    expect(block).toContain('echo "DEPS_TAG=${DEPS_TAG}" | tee -a build-env.txt');
    expect(block).toContain("dotenv: build-env.txt");
  });

  it("runs lint, typecheck and both test suites inside the deps image, without installing packages", () => {
    for (const name of ["lint", "typecheck", "test:unit", "test:integration"]) {
      const block = job(name);
      expect(block, name).toContain("image: $CI_REGISTRY_IMAGE/deps:$DEPS_TAG");
      expect(block, name).toContain("ln -s /app/node_modules node_modules");
    }
  });

  it("runs the repo's own lint, typecheck, unit and integration commands", () => {
    expect(job("lint")).toContain("pnpm lint");
    expect(job("typecheck")).toContain("pnpm typecheck");
    expect(job("test:unit")).toContain("vitest run --project unit");
    expect(job("test:integration")).toContain("vitest run --project integration");
  });

  it("caps the heap of the lint job through NODE_OPTIONS", () => {
    expect(job("lint")).toMatch(/^ {4}NODE_OPTIONS: "--max-old-space-size=3584"$/m);
  });

  it("keeps the heap cap out of the shared lint scripts so local runs are not capped", () => {
    expect(packageJson.scripts.lint).toBe("biome check . && eslint . --no-warn-ignored");
    expect(packageJson.scripts["lint:fix"]).toBe(
      "biome check --write . && eslint . --fix --no-warn-ignored",
    );
  });

  it("points the integration harness at the postgres service through its own variable", () => {
    const block = job("test:integration");
    expect(block).toContain(
      "WD_TEST_PG_URL: postgres://warpdrive:warpdrive@postgres:5432/warpdrive",
    );
    expect(block).not.toContain("DATABASE_URL:");
  });

  it("records junit output for both test suites, with the reporter vitest can actually parse", () => {
    for (const name of ["test:unit", "test:integration"]) {
      const block = job(name);
      expect(block, name).toContain("--reporter=junit --outputFile.junit=junit.xml");
      expect(block, name).not.toContain(" -- --");
    }
    expect(job("test:unit")).toContain("junit: junit.xml");
    expect(job("test:integration")).toContain("junit: junit.xml");
  });

  it("builds the deps and prod-deps images from the Dockerfile stages, tagged by their inputs", () => {
    const deps = job("build-docker-image-deps");
    expect(deps).toContain("ARGS: --target deps");
    expect(deps).toContain("REPO: $CI_REGISTRY_IMAGE/deps");
    expect(deps).toContain("JOB_TAG: $DEPS_TAG");
    const prod = job("build-docker-image-prod-deps");
    expect(prod).toContain("ARGS: --target prod-deps");
    expect(prod).toContain("REPO: $CI_REGISTRY_IMAGE/prod-deps");
    expect(prod).toContain("JOB_TAG: $DEPS_TAG");
  });

  it("assembles the final image on top of both deps images, so only next build remains", () => {
    const block = job("build-docker-image");
    expect(block).toContain("--target runtime");
    expect(block).toContain("--build-arg DEPS_IMAGE=$CI_REGISTRY_IMAGE/deps:$DEPS_TAG");
    expect(block).toContain("--build-arg PROD_DEPS_IMAGE=$CI_REGISTRY_IMAGE/prod-deps:$DEPS_TAG");
    expect(block).toContain("JOB_TAG: $TAG");
  });

  it("passes the commit sha and the ws public url into the image as build args", () => {
    const block = job("build-docker-image");
    expect(block).toContain("--build-arg APP_COMMIT=$CI_COMMIT_SHA");
    expect(block).toContain("--build-arg NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL");
  });

  it("smoke tests the built image in the final tests stage", () => {
    const block = job("smoke-test");
    expect(block).toContain("stage: final tests");
    expect(block).toContain("name: $CI_REGISTRY_IMAGE:$TAG");
    expect(block).toContain("/api/health");
  });

  it("gives the smoke test one network per build so its services resolve each other", () => {
    expect(job("smoke-test")).toContain('FF_NETWORK_PER_BUILD: "true"');
  });

  it("tags the default-branch image as -dev and latest, and never tags a merge request", () => {
    const block = job("tag-images");
    expect(block).toContain("if: '$CI_MERGE_REQUEST_ID'");
    expect(block).toContain("if: '$CI_DEFAULT_BRANCH == $CI_COMMIT_BRANCH'");
    expect(block).toContain("${CI_REGISTRY_IMAGE}:${TAG}-dev");
    expect(block).toContain("${CI_REGISTRY_IMAGE}:latest");
  });
});
