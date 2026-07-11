import { describe, expect, it } from "vitest";
import { formatMdy, parseYmd, toYmd } from "./dateFormat";

describe("dateFormat", () => {
  it("toYmd renders a local YYYY-MM-DD", () => {
    expect(toYmd(new Date(2026, 6, 4))).toBe("2026-07-04");
  });
  it("parseYmd returns a Date for a valid value and null otherwise", () => {
    expect(parseYmd("2026-07-04")?.getFullYear()).toBe(2026);
    expect(parseYmd("")).toBeNull();
    expect(parseYmd("not-a-date")).toBeNull();
  });
  it("parseYmd rejects out-of-range calendar parts instead of rolling over", () => {
    expect(parseYmd("2026-02-30")).toBeNull();
    expect(parseYmd("2026-13-01")).toBeNull();
    expect(parseYmd("2026-00-10")).toBeNull();
    expect(parseYmd("2026-02-28")?.getDate()).toBe(28);
    expect(parseYmd("2026-12-31")?.getMonth()).toBe(11);
  });
  it("formatMdy converts to MM/DD/YYYY and blanks invalid input", () => {
    expect(formatMdy("2026-07-04")).toBe("07/04/2026");
    expect(formatMdy("")).toBe("");
  });
});
