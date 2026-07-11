import type { PgBoss } from "pg-boss";
import { describe, expect, it, vi } from "vitest";

const { prepare, validate, commit, undo } = vi.hoisted(() => ({
  prepare: vi.fn(async () => {}),
  validate: vi.fn(async () => {}),
  commit: vi.fn(async () => {}),
  undo: vi.fn(async () => {}),
}));
vi.mock("./prepareJob", () => ({ registerImportPrepareWorker: prepare }));
vi.mock("./validateJob", () => ({ registerImportValidateWorker: validate }));
vi.mock("./commitJob", () => ({ registerImportCommitWorker: commit }));
vi.mock("./undoJob", () => ({ registerImportUndoWorker: undo }));

import { registerImportWorkers } from "./registerImportWorkers";

describe("registerImportWorkers", () => {
  it("registers all four import workers on the given boss (no queue is left without a consumer)", async () => {
    const boss = {} as PgBoss;
    await registerImportWorkers(boss);
    for (const fn of [prepare, validate, commit, undo]) {
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(boss);
    }
  });
});
