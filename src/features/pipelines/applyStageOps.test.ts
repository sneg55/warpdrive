import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createStageAction = vi.fn();
const updateStageAction = vi.fn();
const deleteStageAction = vi.fn();
vi.mock("./pipelineEditActions", () => ({
  createStageAction: (...args: unknown[]) => createStageAction(...args),
  updateStageAction: (...args: unknown[]) => updateStageAction(...args),
  deleteStageAction: (...args: unknown[]) => deleteStageAction(...args),
}));

import { ERROR_IDS } from "@/constants/errorIds";
import { applyStageOps } from "./applyStageOps";

beforeEach(() => {
  createStageAction.mockResolvedValue({ ok: true, value: { id: "n1" } });
  updateStageAction.mockResolvedValue({ ok: true, value: { id: "s1" } });
  deleteStageAction.mockResolvedValue({ ok: true, value: undefined });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("applyStageOps partial progress", () => {
  it("returns the created ids and settled deletes on success", async () => {
    const r = await applyStageOps(
      "p1",
      {
        creates: [{ name: "New stage", rottingDays: null }],
        updates: [],
        deletes: ["s2"],
      },
      "csrf",
    );
    expect(r).toEqual({ ok: true, createdIds: ["n1"], settledDeletes: ["s2"] });
  });

  it("keeps the created ids when an update fails after the creates", async () => {
    updateStageAction.mockResolvedValue({ ok: false, error: { id: "E_STAGE_001" } });
    const r = await applyStageOps(
      "p1",
      {
        creates: [{ name: "New stage", rottingDays: null }],
        updates: [{ stageId: "s1", name: "Inbound", rottingDays: null }],
        deletes: [],
      },
      "csrf",
    );
    expect(r).toEqual({
      ok: false,
      errorId: "E_STAGE_001",
      createdIds: ["n1"],
      settledDeletes: [],
    });
  });

  it("reports which deletes settled when a later delete fails", async () => {
    deleteStageAction
      .mockResolvedValueOnce({ ok: true, value: undefined })
      .mockResolvedValueOnce({ ok: false, error: { id: "E_STAGE_002" } });
    const r = await applyStageOps(
      "p1",
      { creates: [], updates: [], deletes: ["s2", "s3"] },
      "csrf",
    );
    expect(r).toEqual({
      ok: false,
      errorId: "E_STAGE_002",
      createdIds: [],
      settledDeletes: ["s2"],
    });
  });

  it("keeps earlier created ids when a later create rejects", async () => {
    createStageAction
      .mockResolvedValueOnce({ ok: true, value: { id: "n1" } })
      .mockRejectedValueOnce(new Error("network"));
    const r = await applyStageOps(
      "p1",
      {
        creates: [
          { name: "A", rottingDays: null },
          { name: "B", rottingDays: null },
        ],
        updates: [],
        deletes: [],
      },
      "csrf",
    );
    expect(r).toEqual({
      ok: false,
      errorId: ERROR_IDS.UI_ACTION_UNCONFIRMED,
      createdIds: ["n1"],
      settledDeletes: [],
    });
  });
});
