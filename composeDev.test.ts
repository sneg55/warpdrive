import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const compose = readFileSync(new URL("./docker-compose.dev.yml", import.meta.url), "utf8");

const LONG_RUNNING_SERVICES = ["app", "ws", "worker", "migrate"] as const;
const BUILT_SERVICES = ["app", "ws", "worker", "migrate", "dev-deps"] as const;
const WATCHED_ENTRYPOINTS = [
  ["ws", "src/entrypoints/ws.ts"],
  ["worker", "src/entrypoints/worker.ts"],
] as const;

function service(name: string): string {
  const lines = compose.split("\n");
  const start = lines.indexOf(`  ${name}:`);
  if (start === -1) throw new Error(`no such service: ${name}`);
  const body = lines.slice(start + 1);
  const end = body.findIndex((line) => /^ {2}[\w-]+:$/.test(line) || /^\S/.test(line));
  return (end === -1 ? body : body.slice(0, end)).join("\n");
}

describe("docker compose development stack", () => {
  it.each(
    LONG_RUNNING_SERVICES,
  )("%s mounts the working tree so edits reach the running process", (name) => {
    expect(service(name)).toContain("- .:/app");
  });

  it.each(
    LONG_RUNNING_SERVICES,
  )("%s uses the container-built node_modules instead of the host tree", (name) => {
    expect(service(name)).toContain("dev_node_modules:/app/node_modules");
  });

  it.each(
    LONG_RUNNING_SERVICES,
  )("%s builds the development stage, not the production runtime", (name) => {
    expect(service(name)).toMatch(/^ {6}target: dev$/m);
  });

  it.each(
    BUILT_SERVICES,
  )("%s uses its own dev image name, so the production image is never reused", (name) => {
    expect(service(name)).toMatch(new RegExp(`^ {4}image: warpdrive-dev-${name}$`, "m"));
  });

  it("installs the full dependency tree once, before any service starts", () => {
    const deps = service("dev-deps");
    expect(deps).toMatch(/^ {6}target: deps$/m);
    expect(deps).toContain("- .:/app");
    expect(deps).toContain("dev_node_modules:/app/node_modules");
    expect(deps).toMatch(/command: \["pnpm", "install", "--frozen-lockfile"/);
  });

  it.each([
    "app",
    "ws",
    "worker",
    "migrate",
  ])("%s waits for the dependency install to finish", (name) => {
    expect(service(name)).toMatch(/dev-deps:\n\s+condition: service_completed_successfully/);
  });

  it("runs next dev so edited components hot reload", () => {
    const app = service("app");
    expect(app).toMatch(/node_modules\/\.bin\/next", "dev"/);
    expect(app).toContain("dev_next_cache:/app/.next");
  });

  it.each(WATCHED_ENTRYPOINTS)("%s restarts when its source changes", (name, entrypoint) => {
    expect(service(name)).toContain(`node_modules/.bin/tsx", "watch", "${entrypoint}"`);
  });

  it.each(LONG_RUNNING_SERVICES)("%s runs in development mode", (name) => {
    expect(service(name)).toContain("NODE_ENV: development");
  });
});
