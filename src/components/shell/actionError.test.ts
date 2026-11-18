import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { actionErrorContent } from "./actionError";

describe("actionErrorContent", () => {
  it("falls back to the generic copy for an unmapped id", () => {
    expect(actionErrorContent("E_NOT_A_REAL_ID").title).toBe("Couldn't complete that action");
  });

  it("tells the user to create a pipeline when convert has no target", () => {
    const content = actionErrorContent(ERROR_IDS.LEAD_CONVERT_NO_PIPELINE);
    expect(content.title).not.toBe("Couldn't complete that action");
    expect(content.body).toMatch(/pipeline/i);
  });

  it("tells the user which part of a rejected filter to fix", () => {
    const content = actionErrorContent(ERROR_IDS.DEAL_FILTER_INVALID);
    expect(content.title).not.toBe("Couldn't complete that action");
    expect(content.body).toMatch(/condition/i);
  });

  it("tells the user a lead was already converted", () => {
    const content = actionErrorContent(ERROR_IDS.LEAD_ALREADY_CONVERTED);
    expect(content.title).not.toBe("Couldn't complete that action");
    expect(content.body).toMatch(/deal/i);
  });

  it("explains a stale build instead of the generic copy", () => {
    const content = actionErrorContent(ERROR_IDS.UI_STALE_BUILD);
    expect(content.title).not.toBe("Couldn't complete that action");
    expect(content.body).toMatch(/reload/i);
  });

  it("tells the user the outcome is unconfirmed when the request never answered", () => {
    const content = actionErrorContent(ERROR_IDS.UI_ACTION_UNCONFIRMED);
    expect(content.title).not.toBe("Couldn't complete that action");
    expect(content.title).toMatch(/confirm/i);
  });
});
