import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_DIR = fileURLToPath(new URL("./", import.meta.url));

const INTENTIONAL_FIXED_PALETTE = new Set(["components/shell/LeftNav.tsx"]);

const PALETTE_UTILITY = /(?:[a-z-]+:)*(?:text|bg|border)-(?:gray|slate|zinc|neutral)-\d{2,3}\b/g;

function lightOnly(source: string): string[] {
  return (source.match(PALETTE_UTILITY) ?? []).filter((cls) => !cls.includes("dark:"));
}

function productionTsxFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}${entry.name}`;
    if (entry.isDirectory()) files.push(...productionTsxFiles(`${path}/`));
    else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) files.push(path);
  }
  return files;
}

function relative(path: string): string {
  return path.replace(SRC_DIR, "");
}

function offenders(path: string): string[] {
  return lightOnly(readFileSync(path, "utf8"));
}

describe("theme palette tokens", () => {
  it("renders every surface from semantic tokens so both Day and Night are legible", () => {
    const found = productionTsxFiles(SRC_DIR)
      .filter((path) => !INTENTIONAL_FIXED_PALETTE.has(relative(path)))
      .flatMap((path) => offenders(path).map((cls) => `${relative(path)}: ${cls}`));
    expect(found).toEqual([]);
  });

  it("still flags a light-only utility behind a hover prefix but accepts a dark pair", () => {
    expect(lightOnly('className="hover:bg-gray-50"')).toEqual(["hover:bg-gray-50"]);
    expect(lightOnly('className="bg-muted dark:bg-slate-800"')).toEqual([]);
  });

  it("accepts a dark variant that is not the last one in the chain", () => {
    expect(lightOnly('className="bg-muted dark:hover:bg-gray-800"')).toEqual([]);
  });
});
