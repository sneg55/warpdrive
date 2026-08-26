import { describe, expect, it } from "vitest";
import { countHistoryTabs, historyTabLabel } from "./historyTabCounts";
import type { HistoryItem } from "./historyTimeline";

function item(kind: HistoryItem["kind"], id: string): HistoryItem {
  return { kind, id, at: new Date("2026-07-01T00:00:00Z") } as unknown as HistoryItem;
}

describe("historyTabLabel", () => {
  it("appends the count when the tab holds something", () => {
    expect(historyTabLabel("Email", 4)).toBe("Email (4)");
  });

  it("drops the badge for an empty tab so it never reads as a broken zero", () => {
    expect(historyTabLabel("Activities", 0)).toBe("Activities");
  });

  it("drops the badge when the count is not known yet", () => {
    expect(historyTabLabel("Files", undefined)).toBe("Files");
  });
});

describe("countHistoryTabs", () => {
  it("counts every tab, including the ones that used to carry no badge", () => {
    const counts = countHistoryTabs(
      {
        all: [item("email", "e1"), item("event", "c1")],
        activities: [],
        notes: [],
        email: [item("email", "e1")],
        changelog: [item("event", "c1")],
        files: [],
      },
      3,
    );
    expect(counts).toEqual({
      all: 2,
      activities: 0,
      notes: 0,
      email: 1,
      changelog: 1,
      files: 3,
    });
  });

  it("leaves the Files count unknown while its own read is still pending", () => {
    const counts = countHistoryTabs(
      { all: [], activities: [], notes: [], email: [], changelog: [], files: [] },
      undefined,
    );
    expect(counts.files).toBeUndefined();
  });
});
