import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Font sizes at or above the display floor, written inline as an arbitrary value. Below this the
// app has its own drift (a dozen text-[10px] micro labels), which is a separate scale problem.
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

// An <h1> and the class list on it, when both sit on the same source line.
const HEADING = /<h1[^>]*className="([^"]*)"/g;

// Headings that name something other than the page: a standing message on an error or auth
// screen, and two pane headers inside a split view where the page title sits elsewhere.
const NOT_PAGE_TITLES = new Set([
  "app/(app)/error.tsx",
  "app/(app)/not-found.tsx",
  "app/global-error.tsx",
  "app/(auth)/login/page.tsx",
  "app/oauth/authorize/consent.tsx",
  "app/(app)/inbox/InboxListClient.tsx",
  "features/email/ThreadPane.tsx",
]);

describe("type scale", () => {
  // The critique measured five uses at 20px or above in the whole app, two of them the same 25px
  // page title written out twice. A display size nothing names is a size the next author guesses.
  it("names every display size rather than writing it inline", () => {
    const offenders = sourceFiles(SRC).flatMap((path) =>
      displaySizes(readFileSync(path, "utf8")).map(
        (cls) => `${path.slice(SRC.length + 1)}: ${cls}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  // Hierarchy was carried almost entirely by weight and colour: ten pages titled themselves at
  // text-lg, one step off body copy, so nothing on screen outranked the controls beside it.
  it("titles every page at the display size", () => {
    const offenders = sourceFiles(SRC).flatMap((path) => {
      const rel = path.slice(SRC.length + 1);
      if (NOT_PAGE_TITLES.has(rel)) return [];
      return (
        [...readFileSync(path, "utf8").matchAll(HEADING)]
          .map((m) => (m[1] ?? "").split(/\s+/))
          .filter((classes) => !classes.includes("text-display"))
          // An sr-only h1 exists for the document outline and is never painted, so it has no
          // visual size to get wrong. Surfaces whose title lives in a toolbar use one.
          .filter((classes) => !classes.includes("sr-only"))
          .map((classes) => `${rel}: ${classes.join(" ")}`)
      );
    });
    expect(offenders).toEqual([]);
  });
});
