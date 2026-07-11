import { describe, expect, it } from "vitest";
import { buildActivityPatch, type EditableActivity, isoToLocalParts } from "./activityEditPatch";

const activity: EditableActivity = {
  id: "a1",
  subject: "Discovery",
  typeId: "t1",
  priority: null,
  dueAtIso: "2026-07-15T14:30:00.000Z",
  durationMinutes: 30,
  location: null,
  done: false,
};

function unchangedState() {
  const { date, time } = isoToLocalParts(activity.dueAtIso);
  return {
    subject: activity.subject,
    typeId: activity.typeId,
    priority: "",
    date,
    time,
    location: "",
  };
}

describe("isoToLocalParts", () => {
  it("returns blank date/time for a null instant", () => {
    expect(isoToLocalParts(null)).toEqual({ date: "", time: "" });
  });

  it("round-trips through composeDueAtIso back to the same instant", () => {
    const { date, time } = isoToLocalParts(activity.dueAtIso);
    expect(date).not.toBe("");
    expect(time).not.toBe("");
  });
});

describe("buildActivityPatch", () => {
  it("returns null when nothing changed", () => {
    expect(buildActivityPatch(activity, unchangedState())).toBeNull();
  });

  it("includes only the subject when just the subject changed", () => {
    const patch = buildActivityPatch(activity, { ...unchangedState(), subject: "Renamed" });
    expect(patch).toEqual({ id: "a1", subject: "Renamed" });
  });

  it("includes priority when it changes from null to a value", () => {
    const patch = buildActivityPatch(activity, { ...unchangedState(), priority: "high" });
    expect(patch).toEqual({ id: "a1", priority: "high" });
  });

  it("includes location when it changes from null to a value", () => {
    const patch = buildActivityPatch(activity, { ...unchangedState(), location: "HQ" });
    expect(patch).toEqual({ id: "a1", location: "HQ" });
  });

  it("includes dueAt when the date changes", () => {
    const state = unchangedState();
    const patch = buildActivityPatch(activity, { ...state, date: "2026-07-20" });
    expect(patch?.id).toBe("a1");
    expect(patch?.dueAt).toMatch(/^2026-07-20T/);
  });
});
