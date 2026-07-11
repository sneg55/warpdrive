import { describe, expect, it } from "vitest";
import { diffStages, type StageDiffInput } from "./stageDiff";

const original: StageDiffInput["originalById"] = {
  s1: { name: "Qualified", rottingDays: 7 },
  s2: { name: "Proposal", rottingDays: null },
};

describe("diffStages", () => {
  it("emits no ops when nothing changed", () => {
    const ops = diffStages({
      originalById: original,
      rows: [
        { id: "s1", name: "Qualified", rottingDays: 7 },
        { id: "s2", name: "Proposal", rottingDays: null },
      ],
      deletedIds: [],
    });
    expect(ops.creates).toEqual([]);
    expect(ops.updates).toEqual([]);
    expect(ops.deletes).toEqual([]);
  });

  it("emits an update only for a changed field", () => {
    const ops = diffStages({
      originalById: original,
      rows: [
        { id: "s1", name: "Qualified (renamed)", rottingDays: 7 },
        { id: "s2", name: "Proposal", rottingDays: null },
      ],
      deletedIds: [],
    });
    expect(ops.updates).toEqual([{ stageId: "s1", name: "Qualified (renamed)", rottingDays: 7 }]);
    expect(ops.creates).toEqual([]);
  });

  it("detects a rotting toggle from a value to null", () => {
    const ops = diffStages({
      originalById: original,
      rows: [
        { id: "s1", name: "Qualified", rottingDays: null },
        { id: "s2", name: "Proposal", rottingDays: null },
      ],
      deletedIds: [],
    });
    expect(ops.updates).toEqual([{ stageId: "s1", name: "Qualified", rottingDays: null }]);
  });

  it("emits a create for a new (id-less) row", () => {
    const ops = diffStages({
      originalById: original,
      rows: [
        { id: "s1", name: "Qualified", rottingDays: 7 },
        { id: "s2", name: "Proposal", rottingDays: null },
        { id: null, name: "Negotiation", rottingDays: 14 },
      ],
      deletedIds: [],
    });
    expect(ops.creates).toEqual([{ name: "Negotiation", rottingDays: 14 }]);
    expect(ops.updates).toEqual([]);
  });

  it("passes through deleted ids", () => {
    const ops = diffStages({
      originalById: original,
      rows: [{ id: "s1", name: "Qualified", rottingDays: 7 }],
      deletedIds: ["s2"],
    });
    expect(ops.deletes).toEqual(["s2"]);
  });

  // PIPELINES-07: a StrictMode double-invoked updater can record the same delete id twice, which
  // makes the second deleteStageAction return STAGE_NOT_FOUND and surface a false error. diffStages
  // must collapse duplicate ids so each stage is deleted exactly once.
  it("collapses duplicate deleted ids to a single delete", () => {
    const ops = diffStages({
      originalById: original,
      rows: [{ id: "s1", name: "Qualified", rottingDays: 7 }],
      deletedIds: ["s2", "s2"],
    });
    expect(ops.deletes).toEqual(["s2"]);
  });
});
