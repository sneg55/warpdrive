import { expect, it } from "vitest";
import { parseNotifyPayload } from "@/server/ws/payload";
import { importProgressEvent, progressStep, shouldEmit } from "./progress";

it("computes the throttle step as max(total/50, 100)", () => {
  expect(progressStep(1000)).toBe(100);
  expect(progressStep(50000)).toBe(1000);
});

it("emits on step boundaries and always on the final row", () => {
  expect(shouldEmit(100, 50000, 0)).toBe(false);
  expect(shouldEmit(1000, 50000, 0)).toBe(true);
  expect(shouldEmit(50000, 50000, 49999)).toBe(true);
});

it("builds an event that passes the wire schema", () => {
  const ev = importProgressEvent({
    batchId: "b1",
    phase: "commit",
    processed: 5,
    total: 10,
    status: "importing",
  });
  expect(parseNotifyPayload(ev).ok).toBe(true);
});
