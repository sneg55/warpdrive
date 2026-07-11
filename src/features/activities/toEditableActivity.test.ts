import { describe, expect, it } from "vitest";
import type { ActivityTableRow } from "./activityRows";
import { toEditableActivity } from "./toEditableActivity";

function row(over: Partial<ActivityTableRow> = {}): ActivityTableRow {
  return {
    id: "a1",
    subject: "Site visit",
    typeKey: "call",
    priority: null,
    done: false,
    dueAtIso: "2026-07-02T10:00:00.000Z",
    durationMinutes: null,
    location: null,
    assigneeId: "u1",
    assigneeName: "Owner",
    ownerName: "Owner",
    dealId: null,
    dealTitle: null,
    personId: null,
    personName: null,
    personEmail: null,
    personPhone: null,
    orgId: null,
    orgName: null,
    ...over,
  };
}

describe("toEditableActivity", () => {
  it("prefills the saved location so the edit modal shows it (not a blank field)", () => {
    const editable = toEditableActivity(row({ location: "HQ, 5th floor" }), new Map());
    expect(editable.location).toBe("HQ, 5th floor");
  });

  it("leaves location null when the row has none", () => {
    expect(toEditableActivity(row({ location: null }), new Map()).location).toBeNull();
  });
});
