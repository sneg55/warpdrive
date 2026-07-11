import { describe, expect, it } from "vitest";
import { activityCreateInput } from "./schemas";

const TYPE_ID = "11111111-1111-4111-8111-111111111111";
const LEAD_ID = "22222222-2222-4222-8222-222222222222";
const DEAL_ID = "33333333-3333-4333-8333-333333333333";

describe("activityCreateInput leadId", () => {
  it("accepts and preserves a leadId", () => {
    const r = activityCreateInput.safeParse({
      typeId: TYPE_ID,
      subject: "Log a call",
      leadId: LEAD_ID,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.leadId).toBe(LEAD_ID);
  });

  it("defaults leadId to null when omitted", () => {
    const r = activityCreateInput.safeParse({ typeId: TYPE_ID, subject: "x" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.leadId).toBeNull();
  });

  it("rejects setting both dealId and leadId (single-parent constraint)", () => {
    const r = activityCreateInput.safeParse({
      typeId: TYPE_ID,
      subject: "x",
      dealId: DEAL_ID,
      leadId: LEAD_ID,
    });
    expect(r.success).toBe(false);
  });
});
