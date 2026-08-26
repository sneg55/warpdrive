import { describe, expect, it } from "vitest";
import { trendTooltipValue } from "./trendTooltip";

describe("trendTooltipValue", () => {
  it("states the money and the number of deals behind it", () => {
    expect(trendTooltipValue(58500, { month: "2026-08", count: 3, value: 58500 }, "USD")).toBe(
      "$58,500 from 3 deals",
    );
  });

  it("says deal, singular, for one", () => {
    expect(trendTooltipValue(1500, { month: "2026-01", count: 1, value: 1500 }, "USD")).toBe(
      "$1,500 from 1 deal",
    );
  });

  // The datum shape comes back through recharts as unknown, so a row without a usable count must
  // still render the money rather than "from undefined deals".
  it("falls back to the money alone when the row carries no count", () => {
    expect(trendTooltipValue(1500, undefined, "USD")).toBe("$1,500");
    expect(trendTooltipValue(1500, { nope: true }, "USD")).toBe("$1,500");
  });
});
