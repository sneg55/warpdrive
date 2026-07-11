import { expect, it } from "vitest";
import { parseNotifyPayload } from "./payload";

const base = {
  v: 1,
  channel: "import:11111111-1111-1111-1111-111111111111",
  ts: new Date().toISOString(),
  actorId: null,
};

it("accepts a well-formed import_progress event", () => {
  const r = parseNotifyPayload({
    ...base,
    type: "import_progress",
    data: { batchId: "b1", phase: "commit", processed: 40, total: 100, status: "importing" },
  });
  expect(r.ok).toBe(true);
});

it("rejects import_progress with a bad phase", () => {
  const r = parseNotifyPayload({
    ...base,
    type: "import_progress",
    data: { batchId: "b1", phase: "bogus", processed: 1, total: 1, status: "x" },
  });
  expect(r.ok).toBe(false);
});
