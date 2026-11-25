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

describe("oidc development provider", () => {
  it("runs a pinned authelia image so the IdP config matches the container", () => {
    expect(service("authelia")).toMatch(/^ {4}image: authelia\/authelia:4\.39\.28$/m);
  });

  it("generates the certificates and secrets with the same pinned image before authelia starts", () => {
    const init = service("authelia-init");
    expect(init).toMatch(/^ {4}image: authelia\/authelia:4\.39\.28$/m);
    expect(init).toContain('entrypoint: ["/bin/sh", "/init/generate.sh"]');
    expect(init).toContain("./contrib/authelia/generate.sh:/init/generate.sh:ro");
    expect(init).toContain("./contrib/authelia/generated:/generated");
    expect(init).not.toContain("/generated:ro");
    expect(init).toContain('restart: "no"');
  });

  it("mounts the dev-only IdP config and the generated files read-only", () => {
    const authelia = service("authelia");
    expect(authelia).toContain("./contrib/authelia/configuration.yml:/config/configuration.yml:ro");
    expect(authelia).toContain(
      "./contrib/authelia/users_database.yml:/config/users_database.yml:ro",
    );
    expect(authelia).toContain("./contrib/authelia/generated:/config/generated:ro");
    expect(authelia).not.toContain("contrib/authelia/certs");
  });

  it("enables the template filter that reads the secrets from the generated files", () => {
    expect(service("authelia")).toContain("X_AUTHELIA_CONFIG_FILTERS: template");
  });

  it.each(["authelia", "app"])("%s waits for the generated material to exist", (name) => {
    expect(service(name)).toMatch(/authelia-init:\n\s+condition: service_completed_successfully/);
  });

  it("is reachable on the issuer hostname from both the browser and the app container", () => {
    const authelia = service("authelia");
    expect(authelia).toContain('"authelia.localhost"');
    expect(authelia).toMatch(/ports:\s*\n\s+- "9091:9091"/);
  });

  it("gives the app the oidc client id, the allowed group and the issuer", () => {
    const app = service("app");
    expect(app).toContain("OIDC_ISSUER_URL: https://authelia.localhost:9091");
    expect(app).toContain("OIDC_CLIENT_ID: warpdrive");
    expect(app).toContain("OIDC_ALLOWED_GROUPS: warpdrive-users");
  });

  it("reads the oidc client secret from the generated file and commits no plaintext secret", () => {
    expect(service("app")).toContain(
      "OIDC_CLIENT_SECRET_FILE: /app/contrib/authelia/generated/oidc_client_secret",
    );
    expect(compose).not.toMatch(/OIDC_CLIENT_SECRET:/);
  });

  it("trusts the generated dev CA so the app can reach the https issuer", () => {
    expect(service("app")).toContain("NODE_EXTRA_CA_CERTS: /app/contrib/authelia/generated/ca.crt");
  });
});
