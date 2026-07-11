import { describe, expect, it } from "vitest";
import { LABEL_NAME_MAX, LABELS_PER_ENTITY_MAX, labelNameArray } from "./labelsSchema";

describe("labelNameArray", () => {
  it("accepts arbitrary catalog label names (not a fixed enum)", () => {
    expect(labelNameArray.parse(["Champion", "Decision Maker"])).toEqual([
      "Champion",
      "Decision Maker",
    ]);
  });

  it("dedupes case-insensitively, keeping the first spelling", () => {
    expect(labelNameArray.parse(["Hot", "hot", "HOT"])).toEqual(["Hot"]);
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(labelNameArray.safeParse(["  "]).success).toBe(false);
  });

  it("rejects a name longer than the cap", () => {
    expect(labelNameArray.safeParse(["x".repeat(LABEL_NAME_MAX + 1)]).success).toBe(false);
  });

  it("rejects more labels than the per-entity cap", () => {
    const many = Array.from({ length: LABELS_PER_ENTITY_MAX + 1 }, (_, i) => `L${i}`);
    expect(labelNameArray.safeParse(many).success).toBe(false);
  });
});
