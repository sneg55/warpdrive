import { expect, it } from "vitest";
import { reduceProgress } from "./useImportProgress";

it("reduces an import_progress event into local state", () => {
  const next = reduceProgress(
    { processed: 0, total: 0, status: null },
    { batchId: "b1", phase: "commit", processed: 40, total: 100, status: "importing" },
  );
  expect(next).toEqual({ processed: 40, total: 100, status: "importing" });
});
