import { describe, expect, it } from "vitest";
import { parseNewDeal } from "./newDealForm";

const PIPE = "11111111-1111-1111-1111-111111111111";
const STAGE = "22222222-2222-2222-2222-222222222222";

describe("parseNewDeal", () => {
  it("rejects an empty title", () => {
    const r = parseNewDeal({ title: "   ", stageId: STAGE, value: "" }, PIPE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/title/i);
  });

  it("builds an input with a null value when value is blank", () => {
    const r = parseNewDeal({ title: "Acme deal", stageId: STAGE, value: "" }, PIPE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.title).toBe("Acme deal");
      expect(r.input.value).toBeNull();
      expect(r.input.pipelineId).toBe(PIPE);
      expect(r.input.stageId).toBe(STAGE);
    }
  });

  it("parses and rounds a numeric value to cents", () => {
    const r = parseNewDeal({ title: "Deal", stageId: STAGE, value: "1000.005" }, PIPE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.input.value).toBe(1000.01);
  });

  it("rejects a negative or non-numeric value", () => {
    expect(parseNewDeal({ title: "D", stageId: STAGE, value: "-5" }, PIPE).ok).toBe(false);
    expect(parseNewDeal({ title: "D", stageId: STAGE, value: "abc" }, PIPE).ok).toBe(false);
  });

  it("defaults the rich fields to null when omitted", () => {
    const r = parseNewDeal({ title: "Deal", stageId: STAGE, value: "" }, PIPE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.personId).toBeNull();
    expect(r.input.orgId).toBeNull();
    expect(r.input.labels).toEqual([]);
    expect(r.input.sourceChannel).toBeNull();
    expect(r.input.sourceChannelId).toBeNull();
    expect(r.input.expectedCloseDate).toBeNull();
    expect(r.input.ownerId).toBeUndefined();
  });

  it("carries person, org, label, source, close date and owner through", () => {
    const PERSON = "33333333-3333-3333-3333-333333333333";
    const ORG = "44444444-4444-4444-4444-444444444444";
    const OWNER = "55555555-5555-5555-5555-555555555555";
    const r = parseNewDeal(
      {
        title: "Rich deal",
        stageId: STAGE,
        value: "500",
        personId: PERSON,
        orgId: ORG,
        labels: ["hot"],
        sourceChannel: "referral",
        sourceChannelId: "ref-42",
        expectedCloseDate: "2026-08-01",
        ownerId: OWNER,
      },
      PIPE,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.personId).toBe(PERSON);
    expect(r.input.orgId).toBe(ORG);
    expect(r.input.labels).toEqual(["hot"]);
    expect(r.input.sourceChannel).toBe("referral");
    expect(r.input.sourceChannelId).toBe("ref-42");
    expect(r.input.expectedCloseDate).toBe("2026-08-01");
    expect(r.input.ownerId).toBe(OWNER);
  });

  it("treats blank optional strings as null", () => {
    const r = parseNewDeal(
      { title: "Deal", stageId: STAGE, value: "", sourceChannel: "  ", labels: [] },
      PIPE,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.sourceChannel).toBeNull();
    expect(r.input.labels).toEqual([]);
  });
});
