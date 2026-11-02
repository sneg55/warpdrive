import { describe, expect, it } from "vitest";
import { COMPETITORS } from "./competitors";
import { MIGRATION_STRINGS } from "./migrationStrings";
import { SITE_PAGES } from "./sitePages";

const SECURE_URL = new RegExp("^https:[/][/]");

function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(allStrings);
  return [];
}

const COPY = allStrings([COMPETITORS, MIGRATION_STRINGS, SITE_PAGES]);

describe("site pages", () => {
  it("lists the home, both comparisons, and the migration page", () => {
    expect(SITE_PAGES.map((page) => page.path)).toEqual([
      "/",
      "/vs/twenty",
      "/vs/espocrm",
      "/migrate-from-pipedrive",
    ]);
  });

  it("keeps every page description inside the search snippet length", () => {
    for (const page of SITE_PAGES) {
      expect(page.description.length).toBeLessThanOrEqual(160);
    }
  });

  it("uses no em or en dashes in any page copy", () => {
    for (const text of COPY) expect(text).not.toMatch(/[–—]/);
  });

  it("never opens a sentence with a digit", () => {
    for (const text of COPY) expect(text).not.toMatch(/(^|[.!?]\s+)\d/);
  });
});

describe("competitor comparisons", () => {
  it.each(Object.values(COMPETITORS))("fills both sides of every $name row", (competitor) => {
    expect(competitor.rows.length).toBeGreaterThan(0);
    for (const row of competitor.rows) {
      expect(row.warpdrive.trim()).not.toBe("");
      expect(row.competitor.trim()).not.toBe("");
    }
  });

  it.each(Object.values(COMPETITORS))("cites public sources for $name", (competitor) => {
    expect(competitor.sources.length).toBeGreaterThan(0);
    for (const source of competitor.sources) expect(source.href).toMatch(SECURE_URL);
  });
});
