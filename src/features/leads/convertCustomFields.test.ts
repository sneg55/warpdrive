import { describe, expect, it } from "vitest";
import type { CustomFieldDef } from "@/types/customFields";
import { carryCustomFields } from "./convertCustomFields";

const def = (over: Partial<CustomFieldDef>): CustomFieldDef => ({
  id: over.key ?? "id",
  targetEntity: "lead",
  type: "text",
  name: "F",
  key: "f",
  options: [],
  isRequired: false,
  isImportant: false,
  showInAddForm: false,
  order: 0,
  archivedAt: null,
  ...over,
});

describe("carryCustomFields", () => {
  it("copies a value whose key and type match a deal def", () => {
    const out = carryCustomFields(
      [def({ key: "grade" })],
      [def({ key: "grade", targetEntity: "deal" })],
      {
        grade: "A",
      },
    );
    expect(out).toEqual({ grade: "A" });
  });

  it("skips a key with no deal def, a type mismatch, and an archived lead def", () => {
    const out = carryCustomFields(
      [
        def({ key: "only_lead" }),
        def({ key: "score", type: "numeric" }),
        def({ key: "old", archivedAt: new Date() }),
      ],
      [
        def({ key: "score", targetEntity: "deal", type: "text" }),
        def({ key: "old", targetEntity: "deal" }),
      ],
      { only_lead: "x", score: 5, old: "y" },
    );
    expect(out).toEqual({});
  });

  it("drops an option value the deal def does not offer, keeps one it does", () => {
    const leadDef = def({
      key: "platform",
      type: "single_option",
      options: [
        { id: "mt5", label: "MT5" },
        { id: "ctrader", label: "cTrader" },
      ],
    });
    const dealDef = def({
      key: "platform",
      targetEntity: "deal",
      type: "single_option",
      options: [{ id: "mt5", label: "MT5" }],
    });
    expect(carryCustomFields([leadDef], [dealDef], { platform: "ctrader" })).toEqual({});
    expect(carryCustomFields([leadDef], [dealDef], { platform: "mt5" })).toEqual({
      platform: "mt5",
    });
  });

  it("skips empty values", () => {
    const out = carryCustomFields(
      [def({ key: "grade" })],
      [def({ key: "grade", targetEntity: "deal" })],
      {
        grade: "",
      },
    );
    expect(out).toEqual({});
  });
});
