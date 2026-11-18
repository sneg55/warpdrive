import { describe, expect, test } from "vitest";
import { composeDueAt } from "@/features/activities/activityTime";
import { localPartsFromIso } from "./composerHelpers";

describe("time round trip", () => {
  test("a blank time comes back blank", () => {
    const saved = composeDueAt("2026-08-31", "");
    const reopened = localPartsFromIso(saved.iso, saved.allDay);
    expect(reopened.date).toBe("2026-08-31");
    expect(reopened.time).toBe("");
  });

  test("a real time comes back unchanged", () => {
    const saved = composeDueAt("2026-08-31", "14:30");
    const reopened = localPartsFromIso(saved.iso, saved.allDay);
    expect(reopened).toEqual({ date: "2026-08-31", time: "14:30" });
  });

  test("a deliberately chosen midnight comes back as midnight", () => {
    const saved = composeDueAt("2026-08-31", "00:00");
    const reopened = localPartsFromIso(saved.iso, saved.allDay);
    expect(reopened).toEqual({ date: "2026-08-31", time: "00:00" });
  });

  test("no date at all comes back empty", () => {
    expect(localPartsFromIso(null, false)).toEqual({ date: "", time: "" });
  });
});
