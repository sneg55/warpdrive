import { describe, expect, it } from "vitest";
import type { StageRow } from "./stageDiff";
import {
  assignCreatedIds,
  buildOrderedStageIds,
  reorderRowsByKey,
  stageOrderChanged,
} from "./stageOrder";

interface KeyedRow extends StageRow {
  key: string;
}

function persisted(id: string): KeyedRow {
  return { key: id, id, name: `Stage ${id}`, rottingDays: null };
}

function fresh(key: string): KeyedRow {
  return { key, id: null, name: "New stage", rottingDays: null };
}

describe("reorderRowsByKey", () => {
  it("moves the dragged row to the target position", () => {
    const rows = [persisted("a"), persisted("b"), persisted("c")];
    const out = reorderRowsByKey(rows, "c", "a");
    expect(out.map((r) => r.key)).toEqual(["c", "a", "b"]);
  });

  it("returns the same order when dragged onto itself or onto an unknown key", () => {
    const rows = [persisted("a"), persisted("b")];
    expect(reorderRowsByKey(rows, "a", "a").map((r) => r.key)).toEqual(["a", "b"]);
    expect(reorderRowsByKey(rows, "a", "missing").map((r) => r.key)).toEqual(["a", "b"]);
  });
});

describe("stageOrderChanged", () => {
  it("is false when rows keep the original order", () => {
    const rows = [persisted("a"), persisted("b")];
    expect(stageOrderChanged(["a", "b"], rows)).toBe(false);
  });

  it("is false when new rows are only appended", () => {
    const rows = [persisted("a"), persisted("b"), fresh("new-0")];
    expect(stageOrderChanged(["a", "b"], rows)).toBe(false);
  });

  it("is false when a deleted stage leaves the survivors in original relative order", () => {
    const rows = [persisted("a"), persisted("c")];
    expect(stageOrderChanged(["a", "b", "c"], rows)).toBe(false);
  });

  it("is true when persisted stages are swapped", () => {
    const rows = [persisted("b"), persisted("a")];
    expect(stageOrderChanged(["a", "b"], rows)).toBe(true);
  });

  it("is true when a new row sits before a persisted one", () => {
    const rows = [fresh("new-0"), persisted("a"), persisted("b")];
    expect(stageOrderChanged(["a", "b"], rows)).toBe(true);
  });
});

describe("buildOrderedStageIds", () => {
  it("keeps persisted ids and fills new rows from created ids in row order", () => {
    const rows = [fresh("new-0"), persisted("a"), fresh("new-1"), persisted("b")];
    expect(buildOrderedStageIds(rows, ["n1", "n2"])).toEqual(["n1", "a", "n2", "b"]);
  });

  it("returns only persisted ids when nothing was created", () => {
    const rows = [persisted("b"), persisted("a")];
    expect(buildOrderedStageIds(rows, [])).toEqual(["b", "a"]);
  });
});

describe("assignCreatedIds", () => {
  it("adopts the created ids so a retried save does not create the rows again", () => {
    const rows = [fresh("new-0"), persisted("a"), fresh("new-1")];
    const out = assignCreatedIds(rows, ["n1", "n2"]);
    expect(out.map((r) => r.id)).toEqual(["n1", "a", "n2"]);
    expect(out.map((r) => r.key)).toEqual(["new-0", "a", "new-1"]);
  });

  it("leaves a row without a matching created id unsaved", () => {
    const rows = [fresh("new-0"), fresh("new-1")];
    expect(assignCreatedIds(rows, ["n1"]).map((r) => r.id)).toEqual(["n1", null]);
  });
});
