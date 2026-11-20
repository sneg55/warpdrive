import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const PROD_COMPOSE = "deploy/docker-compose.prod.yml";
const MIGRATE_COMMAND = '["node", "dist/migrate.mjs"]';

describe("every migrate path builds the search indexes", () => {
  it("runs pnpm db:migrate through the migrate entrypoint", () => {
    const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> })
      .scripts;
    expect(scripts["db:migrate"]).toContain("src/entrypoints/migrate.ts");
    expect(scripts["db:migrate"]).not.toContain("drizzle-kit");
  });

  it("does not document a bare drizzle-kit migrate", () => {
    expect(read("docs-site/screenshots/capture.md")).not.toContain("drizzle-kit migrate");
  });

  it("runs the compose migrate service through dist/migrate.mjs", () => {
    expect(read("docker-compose.yml")).toContain(MIGRATE_COMMAND);
  });

  it.skipIf(!existsSync(new URL(PROD_COMPOSE, root)))(
    "runs the prod compose migrate service through dist/migrate.mjs",
    () => {
      expect(read(PROD_COMPOSE)).toContain(MIGRATE_COMMAND);
    },
  );
});
