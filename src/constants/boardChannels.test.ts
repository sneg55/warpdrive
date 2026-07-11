import { describe, expect, it } from "vitest";
import { BOARD_EVENT, dealChannel, dealMovedChannel } from "./boardChannels";

describe("board channels", () => {
  it("builds the pipeline channel name", () => {
    expect(dealMovedChannel("7")).toBe("pipeline:7");
  });
  it("builds the deal channel name", () => {
    expect(dealChannel("42")).toBe("deal:42");
  });
  it("exposes stable event type strings", () => {
    expect(BOARD_EVENT.dealMoved).toBe("deal_moved");
  });
});
