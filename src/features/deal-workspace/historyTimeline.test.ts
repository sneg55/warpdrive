import { describe, expect, it } from "vitest";
import type { CalendarActivity } from "@/features/activities/calendar";
import type { ChangeLogEntry } from "@/features/collaboration/changeLog";
import {
  buildHistoryTimeline,
  formatChangeLabel,
  type NoteItem,
  partitionFocusHistory,
} from "./historyTimeline";

function activity(id: string, subject: string, dueAt: Date, done = false): CalendarActivity {
  return {
    id,
    subject,
    dueAt,
    durationMinutes: null,
    typeKey: "call",
    done,
    dealId: "d1",
    personId: null,
    orgId: null,
    overdue: false,
    ownerName: null,
  };
}

function change(id: string, field: string, createdAt: Date): ChangeLogEntry {
  return { id, field, oldValue: "a", newValue: "b", actorId: null, actorName: null, createdAt };
}

function note(id: string, body: string, createdAt: Date, pinned = false) {
  return { id, body, createdAt, pinned };
}

describe("buildHistoryTimeline", () => {
  it("interleaves activities and change events sorted newest-first", () => {
    const items = buildHistoryTimeline(
      [
        activity("act-old", "Old call", new Date("2026-06-01T10:00:00Z")),
        activity("act-new", "New call", new Date("2026-06-03T10:00:00Z")),
      ],
      [change("chg-mid", "stage", new Date("2026-06-02T10:00:00Z"))],
    );

    expect(items.map((i) => i.id)).toEqual(["act-new", "chg-mid", "act-old"]);
  });

  it("interleaves notes into the feed, tagged and sorted by createdAt", () => {
    const items = buildHistoryTimeline(
      [activity("act", "Call", new Date("2026-06-01T00:00:00Z"))],
      [change("chg", "stage", new Date("2026-06-03T00:00:00Z"))],
      [note("note", "Synced with Sofia", new Date("2026-06-02T00:00:00Z"))],
    );

    expect(items.map((i) => i.id)).toEqual(["chg", "note", "act"]);
    const noteItem = items[1];
    expect(noteItem?.kind).toBe("note");
    if (noteItem?.kind === "note") expect(noteItem.body).toBe("Synced with Sofia");
  });

  it("tags activities as cards and change logs as plain-text events", () => {
    const items = buildHistoryTimeline(
      [activity("a1", "Discovery call", new Date("2026-06-02T00:00:00Z"))],
      [change("c1", "stage", new Date("2026-06-01T00:00:00Z"))],
    );

    const act = items[0];
    const evt = items[1];
    expect(act?.kind).toBe("activity");
    expect(evt?.kind).toBe("event");
    if (evt?.kind === "event") expect(evt.label).toContain("Stage");
  });

  it("uses dueAt for activities and createdAt for events as the sort key", () => {
    const items = buildHistoryTimeline(
      [activity("a1", "Call", new Date("2026-06-05T00:00:00Z"))],
      [change("c1", "stage", new Date("2026-06-04T00:00:00Z"))],
    );
    expect(items[0]?.at).toEqual(new Date("2026-06-05T00:00:00Z"));
  });
});

describe("buildHistoryTimeline: parity block kinds", () => {
  it("maps a stageId change to an inline event row 'Stage: from → to' (matches status changes)", () => {
    const items = buildHistoryTimeline(
      [],
      [
        {
          id: "chg",
          field: "stageId",
          oldValue: "Demo",
          newValue: "Proposal",
          actorId: "u1",
          actorName: "Nick Sawinyh",
          createdAt: new Date("2026-06-02T00:00:00Z"),
        },
      ],
    );
    const stage = items[0];
    expect(stage?.kind).toBe("event");
    if (stage?.kind === "event") {
      expect(stage.label).toBe("Stage: Demo → Proposal");
      expect(stage.actorName).toBe("Nick Sawinyh");
    }
  });

  it("keeps non-stageId fields as event rows carrying actorName", () => {
    const items = buildHistoryTimeline(
      [],
      [
        {
          id: "chg",
          field: "labels",
          oldValue: [],
          newValue: [],
          actorId: "u1",
          actorName: "Nick",
          createdAt: new Date("2026-06-02T00:00:00Z"),
        },
      ],
    );
    const evt = items[0];
    expect(evt?.kind).toBe("event");
    if (evt?.kind === "event") expect(evt.actorName).toBe("Nick");
  });

  it("does not treat a raw 'stage' field as a stage block (only 'stageId')", () => {
    const items = buildHistoryTimeline(
      [],
      [change("chg", "stage", new Date("2026-06-02T00:00:00Z"))],
    );
    expect(items[0]?.kind).toBe("event");
  });

  it("synthesizes a trailing 'Deal created' entry from deal.createdAt + actorName", () => {
    const items = buildHistoryTimeline(
      [activity("a1", "Call", new Date("2026-06-05T00:00:00Z"))],
      [],
      [],
      { createdAt: new Date("2026-06-01T00:00:00Z"), actorName: "Nick" },
    );
    const created = items[items.length - 1];
    expect(created?.kind).toBe("created");
    if (created?.kind === "created") {
      expect(created.at).toEqual(new Date("2026-06-01T00:00:00Z"));
      expect(created.actorName).toBe("Nick");
    }
  });

  it("threads actorName onto note items (null when unresolved)", () => {
    const items = buildHistoryTimeline(
      [],
      [],
      [{ id: "n", body: "hi", createdAt: new Date("2026-06-02T00:00:00Z"), actorName: "Sofia" }],
    );
    const noteItem = items[0];
    expect(noteItem?.kind).toBe("note");
    if (noteItem?.kind === "note") expect(noteItem.actorName).toBe("Sofia");
  });

  it("carries pinned onto note history items", () => {
    const notes: NoteItem[] = [
      { id: "n1", body: "hi", createdAt: new Date("2026-07-02T00:00:00Z"), pinned: true },
    ];
    const items = buildHistoryTimeline([], [], notes);
    const note = items.find((i) => i.kind === "note");
    expect(note).toBeDefined();
    if (note?.kind === "note") expect(note.pinned).toBe(true);
  });
});

describe("partitionFocusHistory", () => {
  it("splits open activities into Focus and the rest into History", () => {
    const items = buildHistoryTimeline(
      [
        { id: "a", subject: "Open", dueAt: new Date(), done: false } as never,
        { id: "b", subject: "Done", dueAt: new Date(), done: true } as never,
      ],
      [],
      [],
    );
    const { focus, history } = partitionFocusHistory(items);
    expect(focus.map((i) => i.id)).toEqual(["a"]);
    expect(history.map((i) => i.id)).toContain("b");
  });

  it("routes notes, stage changes, events, and the created anchor to History, never Focus", () => {
    const items = buildHistoryTimeline(
      [activity("open", "Open call", new Date("2026-06-05T00:00:00Z"))],
      [change("chg", "stage", new Date("2026-06-04T00:00:00Z"))],
      [note("note", "Synced", new Date("2026-06-03T00:00:00Z"))],
      { createdAt: new Date("2026-06-01T00:00:00Z"), actorName: "Nick" },
    );
    const { focus, history } = partitionFocusHistory(items);
    expect(focus.map((i) => i.id)).toEqual(["open"]);
    expect(history.map((i) => i.id)).toEqual(["chg", "note", "deal-created"]);
  });

  it("treats a completed activity (done: true) as History, not Focus", () => {
    const items = buildHistoryTimeline(
      [activity("done-act", "Finished call", new Date("2026-06-05T00:00:00Z"), true)],
      [],
    );
    const { focus, history } = partitionFocusHistory(items);
    expect(focus).toEqual([]);
    expect(history.map((i) => i.id)).toEqual(["done-act"]);
  });

  it("lifts pinned notes into a Pinned bucket, above Focus and out of History", () => {
    const items = buildHistoryTimeline(
      [activity("open", "Open call", new Date("2026-06-05T00:00:00Z"))],
      [],
      [
        note("pinned-note", "Important", new Date("2026-06-03T00:00:00Z"), true),
        note("plain-note", "Synced", new Date("2026-06-02T00:00:00Z"), false),
      ],
    );
    const { pinned, focus, history } = partitionFocusHistory(items);
    // The pinned note floats to its own bucket (rendered above Focus); the plain note stays in
    // History. A pinned note is never duplicated across buckets.
    expect(pinned.map((i) => i.id)).toEqual(["pinned-note"]);
    expect(focus.map((i) => i.id)).toEqual(["open"]);
    expect(history.map((i) => i.id)).toEqual(["plain-note"]);
  });

  it("keeps newest-first order among multiple pinned notes", () => {
    const items = buildHistoryTimeline(
      [],
      [],
      [
        note("pin-old", "Older", new Date("2026-06-01T00:00:00Z"), true),
        note("pin-new", "Newer", new Date("2026-06-04T00:00:00Z"), true),
      ],
    );
    const { pinned } = partitionFocusHistory(items);
    expect(pinned.map((i) => i.id)).toEqual(["pin-new", "pin-old"]);
  });

  it("preserves newest-first order within Focus", () => {
    const items = buildHistoryTimeline(
      [
        activity("open-new", "Newer open", new Date("2026-06-05T00:00:00Z")),
        activity("open-old", "Older open", new Date("2026-06-01T00:00:00Z")),
      ],
      [],
    );
    const { focus } = partitionFocusHistory(items);
    expect(focus.map((i) => i.id)).toEqual(["open-new", "open-old"]);
  });
});

describe("formatChangeLabel", () => {
  it("humanizes the field name and shows old to new with an arrow", () => {
    const label = formatChangeLabel({
      field: "stage",
      oldValue: "Qualified",
      newValue: "Demo Scheduled",
    });
    expect(label).toBe("Stage: Qualified → Demo Scheduled");
  });

  it("converts snake_case fields to readable labels", () => {
    const label = formatChangeLabel({
      field: "expected_close_date",
      oldValue: "2026-06-01",
      newValue: "2026-06-08",
    });
    expect(label).toBe("Expected close date: 2026-06-01 → 2026-06-08");
  });

  it("renders null or empty values as (none)", () => {
    const label = formatChangeLabel({ field: "label", oldValue: null, newValue: "" });
    expect(label).toBe("Label: (none) → (none)");
  });
});
