import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { APPEARANCE_DEFAULT, parseAppearance } from "./appearance";

const SOURCE = readFileSync(fileURLToPath(new URL("./appearance.ts", import.meta.url)), "utf8");

// AppearanceSync is mounted by the root layout, so everything this module imports ships on every
// route. Recognising three literals must not drag zod (~62 KB gzipped) into that bundle, the same
// trap src/lib/isValidEmail.ts exists to avoid.
describe("appearance module weight", () => {
  it("pulls no validation library into the root client bundle", () => {
    expect(SOURCE).not.toMatch(/from ["']zod["']/);
  });

  it("still rejects a value that is not an appearance", () => {
    expect(parseAppearance("night")).toBe("night");
    expect(parseAppearance("day")).toBe("day");
    expect(parseAppearance("system")).toBe("system");
    expect(parseAppearance("purple")).toBe(APPEARANCE_DEFAULT);
    expect(parseAppearance(undefined)).toBe(APPEARANCE_DEFAULT);
    expect(parseAppearance(null)).toBe(APPEARANCE_DEFAULT);
  });
});
