import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// deploy.yml is the only workflow, so it is both the PR gate and the release pipeline. Those two
// roles pull in opposite directions and the failure modes are quiet: a missing pull_request trigger
// means PRs merge unchecked, and a missing event guard means a PR builds and ships to the box.
// Asserted as text rather than parsed YAML: adding a parser dependency to check four lines is a
// worse trade than the regexes.
const workflow = readFileSync(new URL("./.github/workflows/deploy.yml", import.meta.url), "utf8");

// Everything from `  <name>:` up to the next job at the same indent.
function job(name: string): string {
  const match = new RegExp(`^ {2}${name}:$([\\s\\S]*?)(?=^ {2}\\w+:$|$(?![\\s\\S]))`, "m").exec(
    workflow,
  );
  if (match === null) throw new Error(`no such job: ${name}`);
  return match[1] ?? "";
}

describe("deploy workflow", () => {
  it("runs its checks on pull requests, not only after the merge", () => {
    expect(workflow).toMatch(/^ {2}pull_request:$/m);
  });

  it("builds an image for every commit on main, so a tag has something to promote", () => {
    expect(job("build")).toMatch(/refs\/heads\/main/);
  });

  it("never builds or deploys from a pull request, so a proposal cannot reach the box", () => {
    expect(job("build")).toMatch(/if: /);
    expect(job("build")).not.toMatch(/pull_request/);
    expect(job("deploy")).not.toMatch(/pull_request/);
  });

  it("ships on a tag, so merging to main no longer deploys prod by itself", () => {
    expect(workflow).toMatch(/tags: \['v\*'\]/);
    const deploy = job("deploy");
    expect(deploy).toMatch(/refs\/tags\/v/);
    // The escape hatch for a hotfix that must not wait for a release.
    expect(deploy).toMatch(/workflow_dispatch/);
  });

  it("promotes the image main already built rather than rebuilding at tag time", () => {
    // A rebuild would ship an artifact no gate ever ran against. The tag resolves to its commit,
    // and that commit's image was built and gated when it landed on main.
    expect(job("deploy")).not.toMatch(/build-push-action/);
    expect(job("deploy")).toMatch(/github\.sha/);
  });

  it("refuses to deploy a commit that was never built, instead of pulling a tag that is not there", () => {
    // Tagging a commit that never reached main, or whose build failed, has no image. Without this
    // the box's `docker compose pull` is the first thing to notice, mid-deploy.
    expect(job("deploy")).toMatch(/manifest inspect/);
  });

  it("serialises prod deploys, so two tags pushed together cannot race on the box", () => {
    // The workflow-level group keys on the ref, and two tags are two refs.
    expect(job("deploy")).toMatch(/concurrency:/);
  });

  it("checks lint and types in the gate, since a pull request never reaches the build job", () => {
    const test = job("test");
    expect(test).toMatch(/run: pnpm lint/);
    expect(test).toMatch(/run: pnpm typecheck/);
    expect(test).toMatch(/run: pnpm test:unit/);
  });

  it("runs the OSS publish guard, which nothing ran and which sat red because of it", () => {
    // The guard decides what may leave for the public mirror. Vitest does not cover it (it is a
    // shell suite), so until it was in the gate a broken one was invisible.
    expect(job("test")).toMatch(/run: pnpm test:oss/);
  });

  it("fails the deploy when the app does not come up healthy", () => {
    const deploy = job("deploy");
    // `docker compose ps` exits 0 at any health state, so it cannot be the verification.
    expect(deploy).toMatch(/Health\.Status/);
    expect(deploy).toMatch(/exit 1/);
  });

  it("gives every remote session the image ref its compose commands need", () => {
    // WARPDRIVE_IMAGE is what docker-compose.prod.yml resolves each service's image from. It is
    // exported per ssh invocation, so a step that opens its own session and forgets it does not
    // fail on the app's health, it fails parsing the compose project before it can look.
    const sessions = job("deploy").split("ssh -i ~/.ssh/id_deploy").slice(1);
    expect(sessions.length).toBeGreaterThan(0);
    for (const session of sessions) {
      expect(session).toMatch(/WARPDRIVE_IMAGE=/);
    }
  });
});
