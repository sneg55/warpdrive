import { describe, expect, it } from "vitest";
import { buildColumnOptions } from "./MapStep";

const values = (opts: { value: string }[]): string[] => opts.map((o) => o.value);

describe("buildColumnOptions built-in gating", () => {
  it("omits a hidden standard field and keeps the rest", () => {
    const hidden = { organization: new Set(["industry"]) };
    const opts = buildColumnOptions("organization", [], hidden);
    const v = values(opts);
    expect(v).not.toContain("s:organization:industry");
    expect(v).toContain("s:organization:name");
    expect(v).toContain("s:organization:domain");
  });

  it("omits every address leaf when address is hidden", () => {
    const hidden = { organization: new Set(["address"]) };
    const v = values(buildColumnOptions("organization", [], hidden));
    expect(v.some((x) => x.startsWith("s:organization:address."))).toBe(false);
    expect(v).toContain("s:organization:name");
  });

  it("shows everything when nothing is hidden (empty map)", () => {
    const v = values(buildColumnOptions("organization", [], {}));
    expect(v).toContain("s:organization:industry");
    expect(v).toContain("s:organization:address.city");
  });

  it("never drops a required primary field even if marked hidden", () => {
    // "name" is the required org key; a crafted hidden entry must not remove it.
    const hidden = { organization: new Set(["name"]) };
    const v = values(buildColumnOptions("organization", [], hidden));
    expect(v).toContain("s:organization:name");
  });
});
