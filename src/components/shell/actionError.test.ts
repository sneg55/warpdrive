import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { actionErrorContent } from "./actionError";

describe("actionErrorContent", () => {
  it("falls back to the generic copy for an unmapped id", () => {
    expect(actionErrorContent("E_NOT_A_REAL_ID").title).toBe("Couldn't complete that action");
  });

  // Convert-to-deal with no pipeline at all is a setup problem the user can fix themselves, and the
  // generic "something went wrong, please refresh" copy sends them in circles: refreshing never
  // helps. Naming the cause is the whole difference between a dead end and a next step.
  it("tells the user to create a pipeline when convert has no target", () => {
    const content = actionErrorContent(ERROR_IDS.LEAD_CONVERT_NO_PIPELINE);
    expect(content.title).not.toBe("Couldn't complete that action");
    expect(content.body).toMatch(/pipeline/i);
  });

  it("tells the user a lead was already converted", () => {
    const content = actionErrorContent(ERROR_IDS.LEAD_ALREADY_CONVERTED);
    expect(content.title).not.toBe("Couldn't complete that action");
    expect(content.body).toMatch(/deal/i);
  });
});
