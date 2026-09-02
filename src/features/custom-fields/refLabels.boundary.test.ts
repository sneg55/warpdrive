import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(__dirname);

describe("refLabels.ts / refLabelsShared.ts client boundary", () => {
  it("refLabels.ts does not import from the client-only refLabelsContext module", () => {
    const source = readFileSync(join(dir, "refLabels.ts"), "utf8");
    expect(source).not.toMatch(/from ["']\.\/refLabelsContext["']/);
  });

  it("refLabelsShared.ts does not open with a use client directive", () => {
    const source = readFileSync(join(dir, "refLabelsShared.ts"), "utf8");
    const firstLine = source.split("\n")[0]?.trim();
    expect(firstLine).not.toBe('"use client";');
  });
});
