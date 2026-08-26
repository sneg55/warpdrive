import { describe, expect, it } from "vitest";
import { buildActivityPatch, type EditableActivity, isoToLocalParts } from "./activityEditPatch";
import { composeDueAt } from "./activityTime";

const activity: EditableActivity = {
  id: "a1",
  subject: "Discovery",
  typeId: "t1",
  priority: null,
  dueAtIso: "2026-07-15T14:30:00.000Z",
  allDay: false,
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

// The same bug on the modal surface: an all-day activity opened from the table must seed a
// blank time, and saving with it blank must not silently convert it to an explicit midnight.
describe("all-day activities in the edit modal", () => {
  const allDayActivity: EditableActivity = {
    ...activity,
    dueAtIso: composeDueAt("2026-08-31", "").iso,
    allDay: true,
  };

  it("seeds a blank time from an all-day activity", () => {
    expect(isoToLocalParts(allDayActivity.dueAtIso, true).time).toBe("");
  });

  it("still seeds the day", () => {
    expect(isoToLocalParts(allDayActivity.dueAtIso, true).date).toBe("2026-08-31");
  });

  it("produces no patch when an all-day activity is saved untouched", () => {
    const parts = isoToLocalParts(allDayActivity.dueAtIso, true);
    const patch = buildActivityPatch(allDayActivity, {
      typeId: allDayActivity.typeId,
      subject: allDayActivity.subject,
      priority: allDayActivity.priority ?? "",
      date: parts.date,
      time: parts.time,
      location: allDayActivity.location ?? "",
    });
    expect(patch).toBeNull();
  });

  it("turns an all-day activity into a timed one when a time is typed", () => {
    const patch = buildActivityPatch(allDayActivity, {
      typeId: allDayActivity.typeId,
      subject: allDayActivity.subject,
      priority: allDayActivity.priority ?? "",
      date: "2026-08-31",
      time: "09:00",
      location: allDayActivity.location ?? "",
    });
    expect(patch?.allDay).toBe(false);
  });
});
