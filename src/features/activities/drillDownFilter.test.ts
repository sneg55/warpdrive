import { describe, expect, it } from "vitest";
import { buildCompletedActivitiesHref } from "@/features/stats/drillDownHref";
import { activitiesDrillDownSeed } from "./drillDownFilter";

const ACTOR = "6f1c2a3e-1b2c-4d5e-8f90-123456789abc";
const PIPELINE = "0b8e9c1d-2a3b-4c5d-9e0f-abcdef012345";
const PIPELINES = [{ id: PIPELINE, name: "Sales" }];

function paramsOf(href: string | null): Record<string, string> {
  return Object.fromEntries(new URL(href ?? "", "http://x").searchParams.entries());
}

describe("activitiesDrillDownSeed", () => {
  it("seeds the completed-activities filter with me resolved to the actor and the pipeline named", () => {
    const href = buildCompletedActivitiesHref({
      owner: { kind: "me" },
      pipelineId: PIPELINE,
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(activitiesDrillDownSeed(paramsOf(href), ACTOR, PIPELINES)).toEqual({
      filter: {
        ownerId: ACTOR,
        done: "done",
        from: "2026-01-01",
        to: "2026-12-31",
        dateBasis: "done",
        pipelineId: PIPELINE,
        typeKey: null,
      },
      pipelineName: "Sales",
    });
  });

  it("leaves the owner open for everyone and names no pipeline when none is set", () => {
    const href = buildCompletedActivitiesHref({
      owner: { kind: "all" },
      pipelineId: null,
      from: "2026-01-01",
      to: "2026-12-31",
    });
    const seed = activitiesDrillDownSeed(paramsOf(href), ACTOR, PIPELINES);
    expect(seed?.filter.ownerId).toBeNull();
    expect(seed?.pipelineName).toBeNull();
  });

  it("returns null for a plain visit", () => {
    expect(activitiesDrillDownSeed({}, ACTOR, PIPELINES)).toBeNull();
  });
});
