import { describe, expect, it } from "vitest";
import {
  type AttributeFilterState,
  filterByAttributes,
  NO_ATTRIBUTE_FILTER,
} from "./threadAttributeFilter";

type Row = {
  id: string;
  followUpStatus: string | null;
  labels: string[];
  hasAttachment: boolean;
  unread: boolean;
  lastMessageAt: string | null;
};

// Fixed clock so the date-range presets are deterministic.
const NOW = new Date("2026-07-11T00:00:00Z");

const rows: Row[] = [
  {
    id: "a",
    followUpStatus: "waiting",
    labels: ["important"],
    hasAttachment: true,
    unread: true,
    lastMessageAt: "2026-07-08T00:00:00Z", // 3 days ago
  },
  {
    id: "b",
    followUpStatus: "replied",
    labels: ["to_do", "later"],
    hasAttachment: false,
    unread: false,
    lastMessageAt: "2026-06-20T00:00:00Z", // 21 days ago
  },
  {
    id: "c",
    followUpStatus: null,
    labels: [],
    hasAttachment: true,
    unread: false,
    lastMessageAt: null, // never
  },
  {
    id: "d",
    followUpStatus: "waiting",
    labels: ["later"],
    hasAttachment: false,
    unread: true,
    lastMessageAt: "2026-05-01T00:00:00Z", // 71 days ago
  },
];

const ids = (state: AttributeFilterState): string[] =>
  filterByAttributes(rows, state, NOW).map((r) => r.id);

describe("filterByAttributes", () => {
  it("returns every thread when no filter is set", () => {
    expect(ids(NO_ATTRIBUTE_FILTER)).toEqual(["a", "b", "c", "d"]);
  });

  it("narrows to a single follow-up status", () => {
    expect(ids({ ...NO_ATTRIBUTE_FILTER, followUp: "waiting" })).toEqual(["a", "d"]);
  });

  it("narrows to threads carrying a label", () => {
    expect(ids({ ...NO_ATTRIBUTE_FILTER, label: "later" })).toEqual(["b", "d"]);
  });

  it("applies follow-up and label together (AND)", () => {
    expect(ids({ ...NO_ATTRIBUTE_FILTER, followUp: "waiting", label: "later" })).toEqual(["d"]);
  });

  it("keeps only threads with an attachment", () => {
    expect(ids({ ...NO_ATTRIBUTE_FILTER, hasAttachment: true })).toEqual(["a", "c"]);
  });

  it("keeps only unread threads", () => {
    expect(ids({ ...NO_ATTRIBUTE_FILTER, unreadOnly: true })).toEqual(["a", "d"]);
  });

  it("keeps only threads within the last 7 days for the 7d preset", () => {
    expect(ids({ ...NO_ATTRIBUTE_FILTER, dateRange: "7d" })).toEqual(["a"]);
  });

  it("keeps only threads within the last 30 days for the 30d preset", () => {
    expect(ids({ ...NO_ATTRIBUTE_FILTER, dateRange: "30d" })).toEqual(["a", "b"]);
  });

  it("a null lastMessageAt fails any active date filter", () => {
    // Thread c has an attachment but a null lastMessageAt, so it drops under a date preset.
    expect(ids({ ...NO_ATTRIBUTE_FILTER, hasAttachment: true, dateRange: "30d" })).toEqual(["a"]);
  });

  it("ANDs the quick-filters together", () => {
    // Unread AND within 7 days: only a (d is unread but 71 days old).
    expect(ids({ ...NO_ATTRIBUTE_FILTER, unreadOnly: true, dateRange: "7d" })).toEqual(["a"]);
  });
});
