import { describe, expect, it } from "vitest";
import { FILTER_OP_LABELS } from "@/constants/filterOps";
import { OPS_BY_FIELD } from "@/features/saved-filters/filterFields";
import { blankConditionRow, dealFilterFields, OP_LABELS } from "./dealFilterCatalog";

const OWNERS = [{ id: "u1", name: "Ada King" }];
const STAGES = [{ id: "s1", name: "Qualified" }];

describe("dealFilterFields", () => {
  it("offers the deal fields both builders share, in one order", () => {
    expect(dealFilterFields().map((f) => f.field)).toEqual([
      "title",
      "orgName",
      "value",
      "ownerId",
      "stageId",
      "expectedCloseDate",
      "nextActivityAt",
      "lastActivityAt",
      "labels",
    ]);
  });

  it("offers the activity dates as date fields with Pipedrive's labels", () => {
    const fields = dealFilterFields();
    const byField = (name: string) => fields.find((f) => f.field === name);
    expect(byField("nextActivityAt")?.label).toBe("Next activity date");
    expect(byField("nextActivityAt")?.input.kind).toBe("date");
    expect(byField("lastActivityAt")?.label).toBe("Last activity date");
    expect(byField("lastActivityAt")?.input.kind).toBe("date");
  });

  it("never offers status (the board query hardcodes status = 'open')", () => {
    expect(dealFilterFields().map((f) => f.field)).not.toContain("status");
  });

  it("takes each field's operators from the schema allow-list", () => {
    for (const f of dealFilterFields()) {
      expect(f.ops).toBe(OPS_BY_FIELD[f.field]);
    }
  });

  it("renders owners, stages, and labels as select options", () => {
    const fields = dealFilterFields({ owners: OWNERS, stages: STAGES, labelOptions: ["Hot"] });
    const byField = (name: string) => fields.find((f) => f.field === name)?.input;
    expect(byField("ownerId")).toEqual({
      kind: "select",
      options: [{ value: "u1", label: "Ada King" }],
    });
    expect(byField("stageId")).toEqual({
      kind: "select",
      options: [{ value: "s1", label: "Qualified" }],
    });
    // Labels take a list: PD's label filter is "is any of", which is one condition, not two.
    expect(byField("labels")).toEqual({
      kind: "multiselect",
      options: [{ value: "Hot", label: "Hot" }],
    });
  });

  it("uses free-entry inputs for text, number, and date fields", () => {
    const fields = dealFilterFields();
    const kind = (name: string) => fields.find((f) => f.field === name)?.input.kind;
    expect(kind("title")).toBe("text");
    expect(kind("orgName")).toBe("text");
    expect(kind("value")).toBe("number");
    expect(kind("expectedCloseDate")).toBe("date");
  });

  it("seeds a blank row from the first field and its first operator", () => {
    const row = blankConditionRow(dealFilterFields());
    expect(row).toMatchObject({ field: "title", op: "contains", value: "" });
    expect(row.id).not.toBe("");
  });

  it("labels every operator any offered field can use", () => {
    for (const f of dealFilterFields()) {
      for (const op of f.ops) expect(OP_LABELS[op]).toBeTypeOf("string");
    }
  });

  it("takes its operator labels from the shared vocabulary, not a second copy", () => {
    expect(OP_LABELS).toBe(FILTER_OP_LABELS);
  });
});
