import { describe, expect, test } from "vitest";
import { parseNotifyPayload } from "./payload";

// The PUBLISHED payload (what pg_notify carries) has NO seq: the WS server stamps
// a per-socket seq at send time (ops spec A4).
const base = {
  v: 1,
  type: "deal_moved",
  channel: "pipeline:7",
  ts: "2026-06-29T12:00:00.000Z",
  actorId: "u3",
};

describe("notify payload", () => {
  test("accepts a well-formed deal_moved event without seq", () => {
    const r = parseNotifyPayload({
      ...base,
      data: { dealId: "d1", fromStageId: "s1", toStageId: "s2", boardPosition: "1.5" },
    });
    expect(r.ok).toBe(true);
  });
  test("rejects an unknown event type", () => {
    const r = parseNotifyPayload({ ...base, type: "nope", data: {} });
    expect(r.ok).toBe(false);
  });
  test("rejects a payload over 8000 bytes", () => {
    const r = parseNotifyPayload({
      ...base,
      data: { dealId: "x".repeat(9000), fromStageId: "s", toStageId: "s", boardPosition: "0" },
    });
    expect(r.ok).toBe(false);
  });
});
