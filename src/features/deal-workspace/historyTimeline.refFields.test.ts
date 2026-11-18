import { describe, expect, it } from "vitest";
import {
  CHANGE_FIELD_CONVERTED_DEAL,
  CHANGE_FIELD_CONVERTED_TO_LEAD,
  CHANGE_FIELD_CREATED_FROM_DEAL,
  CHANGE_FIELD_DUPLICATED_FROM_DEAL,
  CHANGE_FIELD_MERGE,
  CHANGE_FIELD_MERGED_DEAL,
  CHANGE_FIELD_OWNER_ID,
} from "@/constants/changeLogFields";
import { formatChangeLabel } from "./historyTimeline";

describe("formatChangeLabel: rows whose values are resolved record names", () => {
  it("labels an owner change as Owner with both names", () => {
    expect(
      formatChangeLabel({ field: CHANGE_FIELD_OWNER_ID, oldValue: "Alice", newValue: "Bob" }),
    ).toBe("Owner: Alice → Bob");
  });

  it.each([
    [CHANGE_FIELD_MERGED_DEAL, "Merged deal: Acme"],
    [CHANGE_FIELD_DUPLICATED_FROM_DEAL, "Duplicated from deal: Acme"],
    [CHANGE_FIELD_CONVERTED_TO_LEAD, "Converted to lead: Acme"],
    [CHANGE_FIELD_CREATED_FROM_DEAL, "Created from deal: Acme"],
    [CHANGE_FIELD_CONVERTED_DEAL, "Converted to deal: Acme"],
  ])("labels %s by the linked record alone", (field, expected) => {
    expect(formatChangeLabel({ field, oldValue: null, newValue: "Acme" })).toBe(expected);
  });

  it("labels a contact merge by the record that was merged in", () => {
    expect(
      formatChangeLabel({ field: CHANGE_FIELD_MERGE, oldValue: "Jane Doe", newValue: "Jane D." }),
    ).toBe("Merged with: Jane Doe");
  });
});
