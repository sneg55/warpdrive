// historyTimeline.auditFields.test.ts: labeling for the broadened deal changelog
// fields (Wave 3 task 16: title/value/probability/expectedCloseDate). Split out
// of historyTimeline.test.ts to keep both files under the size limit.
import { describe, expect, it } from "vitest";
import {
  CHANGE_FIELD_EXPECTED_CLOSE,
  CHANGE_FIELD_TITLE,
  CHANGE_FIELD_VALUE,
} from "@/constants/changeLogFields";
import { buildHistoryTimeline, formatChangeLabel } from "./historyTimeline";

describe("formatChangeLabel: broadened deal audit fields (Wave 3 task 16)", () => {
  it("labels a title change", () => {
    const label = formatChangeLabel({
      field: CHANGE_FIELD_TITLE,
      oldValue: "Old Deal",
      newValue: "New Deal",
    });
    expect(label).toBe("Title: Old Deal → New Deal");
  });

  it("labels a value change readably, containing the field name and both amounts", () => {
    const label = formatChangeLabel({
      field: CHANGE_FIELD_VALUE,
      oldValue: "1000",
      newValue: "2000",
    });
    expect(label).toContain("Value");
    expect(label).toContain("1000");
    expect(label).toContain("2000");
  });

  it("labels an expected-close-date change", () => {
    const label = formatChangeLabel({
      field: CHANGE_FIELD_EXPECTED_CLOSE,
      oldValue: "2026-06-01",
      newValue: "2026-08-01",
    });
    expect(label).toBe("Expected close date: 2026-06-01 → 2026-08-01");
  });

  it("labels a custom-field change as 'Custom field' with both values", () => {
    const label = formatChangeLabel({
      field: "custom_field:region",
      oldValue: "EMEA",
      newValue: "APAC",
    });
    expect(label).toBe("Custom field: EMEA → APAC");
  });

  it("renders a null starting value (never set) as (none)", () => {
    const label = formatChangeLabel({
      field: CHANGE_FIELD_VALUE,
      oldValue: null,
      newValue: "2000.00",
    });
    expect(label).toBe("Value: (none) → 2000.00");
  });

  it("labels a person link/unlink/change directionally without leaking the id", () => {
    expect(formatChangeLabel({ field: "person_id", oldValue: null, newValue: "p1" })).toBe(
      "Linked a person",
    );
    expect(formatChangeLabel({ field: "person_id", oldValue: "p1", newValue: null })).toBe(
      "Unlinked the person",
    );
    expect(formatChangeLabel({ field: "person_id", oldValue: "p1", newValue: "p2" })).toBe(
      "Changed the linked person",
    );
  });

  it("labels an organization link/unlink/change directionally", () => {
    expect(formatChangeLabel({ field: "org_id", oldValue: null, newValue: "o1" })).toBe(
      "Linked an organization",
    );
    expect(formatChangeLabel({ field: "org_id", oldValue: "o1", newValue: null })).toBe(
      "Unlinked the organization",
    );
    expect(formatChangeLabel({ field: "org_id", oldValue: "o1", newValue: "o2" })).toBe(
      "Changed the linked organization",
    );
  });

  it("labels participant add/remove directionally", () => {
    expect(formatChangeLabel({ field: "participant", oldValue: null, newValue: "p1" })).toBe(
      "Added a participant",
    );
    expect(formatChangeLabel({ field: "participant", oldValue: "p1", newValue: null })).toBe(
      "Removed a participant",
    );
  });

  it("labels follower add/remove directionally", () => {
    expect(formatChangeLabel({ field: "follower", oldValue: null, newValue: "u1" })).toBe(
      "Started following",
    );
    expect(formatChangeLabel({ field: "follower", oldValue: "u1", newValue: null })).toBe(
      "Stopped following",
    );
  });

  it("toChangeItem produces a plain event row (not a stage block) for these fields", () => {
    const items = buildHistoryTimeline(
      [],
      [
        {
          id: "chg",
          field: CHANGE_FIELD_VALUE,
          oldValue: "1000.00",
          newValue: "2000.00",
          actorId: "u1",
          actorName: "Nick",
          createdAt: new Date("2026-06-02T00:00:00Z"),
        },
      ],
    );
    const evt = items[0];
    expect(evt?.kind).toBe("event");
    if (evt?.kind === "event") {
      expect(evt.label).toBe("Value: 1000.00 → 2000.00");
      expect(evt.actorName).toBe("Nick");
    }
  });
});
