import { describe, expect, it } from "vitest";
import { buildWonDealsHref } from "@/features/stats/drillDownHref";
import { DEFAULT_BOARD_VIEW } from "./boardView";
import { wonDealsDrillDownSeed } from "./wonDealsDrillDown";

const ACTOR = "6f1c2a3e-1b2c-4d5e-8f90-123456789abc";
const PIPELINE = "0b8e9c1d-2a3b-4c5d-9e0f-abcdef012345";
const OTHER_PIPELINE = "1c9f0d2e-3b4c-4d6e-8f10-bcdef0123456";

function paramsOf(href: string | null): Record<string, string> {
  return Object.fromEntries(new URL(href ?? "", "http://x").searchParams.entries());
}

const HREF = buildWonDealsHref({
  owner: { kind: "me" },
  pipelineId: PIPELINE,
  from: "2026-01-01",
  to: "2026-12-31",
});

describe("wonDealsDrillDownSeed", () => {
  it("narrows to won deals in the range, owner as a server-side condition", () => {
    expect(wonDealsDrillDownSeed(paramsOf(HREF), ACTOR, PIPELINE)).toEqual({
      ...DEFAULT_BOARD_VIEW,
      conditions: {
        combinator: "and",
        conditions: [
          { field: "status", op: "eq", value: "won" },
          { field: "wonTime", op: "gte", value: "2026-01-01" },
          { field: "wonTime", op: "lte", value: "2026-12-31" },
          { field: "ownerId", op: "eq", value: ACTOR },
        ],
      },
    });
  });

  it("ignores a drill-down addressed to a different pipeline than the page", () => {
    expect(wonDealsDrillDownSeed(paramsOf(HREF), ACTOR, OTHER_PIPELINE)).toBeNull();
  });

  it("returns null for a plain visit", () => {
    expect(wonDealsDrillDownSeed({}, ACTOR, PIPELINE)).toBeNull();
  });
});
