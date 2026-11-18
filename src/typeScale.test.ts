import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DISPLAY_FLOOR_PX = 20;
const ARBITRARY_PX = /\btext-\[(\d+(?:\.\d+)?)px\]/g;

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry) || entry.includes(".test.")) return [];
    return [path];
  });
}

function displaySizes(source: string): string[] {
  return [...source.matchAll(ARBITRARY_PX)]
    .filter((m) => Number(m[1]) >= DISPLAY_FLOOR_PX)
    .map((m) => m[0]);
}

const HEADING = /<h1[^>]*className="([^"]*)"/g;

const NOT_PAGE_TITLES = new Set([
  "app/(app)/error.tsx",
  "app/(app)/not-found.tsx",
  "app/global-error.tsx",
  "app/(auth)/login/page.tsx",
  "app/oauth/authorize/consent.tsx",
  "app/(app)/inbox/InboxListClient.tsx",
  "features/email/ThreadPane.tsx",
  "features/x-dms/ui/XConversationList.tsx",
  "features/x-dms/ui/XConversationPane.tsx",
]);

describe("type scale", () => {
  it("names every display size rather than writing it inline", () => {
    const offenders = sourceFiles(SRC).flatMap((path) =>
      displaySizes(readFileSync(path, "utf8")).map(
        (cls) => `${path.slice(SRC.length + 1)}: ${cls}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("titles every page at the display size", () => {
    const offenders = sourceFiles(SRC).flatMap((path) => {
      const rel = path.slice(SRC.length + 1);
      if (NOT_PAGE_TITLES.has(rel)) return [];
      return [...readFileSync(path, "utf8").matchAll(HEADING)]
        .map((m) => (m[1] ?? "").split(/\s+/))
        .filter((classes) => !classes.includes("text-display"))
        .filter((classes) => !classes.includes("sr-only"))
        .map((classes) => `${rel}: ${classes.join(" ")}`);
    });
    expect(offenders).toEqual([]);
  });
});
