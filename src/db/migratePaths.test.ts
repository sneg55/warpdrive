import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

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

  it("runs the compose migrate services through dist/migrate.mjs", () => {
    for (const file of ["docker-compose.yml", "deploy/docker-compose.prod.yml"]) {
      expect(read(file)).toContain('["node", "dist/migrate.mjs"]');
    }
  });
});
