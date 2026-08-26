import { describe, expect, it } from "vitest";
import { formatChangeLabel } from "./historyTimeline";

describe("formatChangeLabel: lost status carries its reason and comment", () => {
  it("appends the predefined reason and the free-text comment", () => {
    expect(
      formatChangeLabel({
        field: "status",
        oldValue: "open",
        newValue: { value: "lost", reason: "Bad timing", comment: "my bad, this was old" },
      }),
    ).toBe("Status: open → lost · Bad timing · my bad, this was old");
  });

  it("appends whichever side is present", () => {
    expect(
      formatChangeLabel({
        field: "status",
        oldValue: "open",
        newValue: { value: "lost", reason: "Bad timing", comment: null },
      }),
    ).toBe("Status: open → lost · Bad timing");
    expect(
      formatChangeLabel({
        field: "status",
        oldValue: "open",
        newValue: { value: "lost", reason: null, comment: "no budget" },
      }),
    ).toBe("Status: open → lost · no budget");
  });

  it("leaves a legacy plain-string status row as the bare diff", () => {
    expect(formatChangeLabel({ field: "status", oldValue: "open", newValue: "lost" })).toBe(
      "Status: open → lost",
    );
    expect(formatChangeLabel({ field: "status", oldValue: "lost", newValue: "open" })).toBe(
      "Status: lost → open",
    );
  });
});
