import { describe, expect, it } from "vitest";
import { parseDrillDown, resolveDrillDownOwner } from "./drillDown";
import { buildCompletedActivitiesHref, buildWonDealsHref } from "./drillDownHref";

const USER = "6f1c2a3e-1b2c-4d5e-8f90-123456789abc";
const PIPELINE = "0b8e9c1d-2a3b-4c5d-9e0f-abcdef012345";
const RANGE = { from: "2026-01-01", to: "2026-12-31" };

function paramsOf(href: string): Record<string, string> {
  return Object.fromEntries(new URL(href, "http://x").searchParams.entries());
}

function pathOf(href: string): string {
  return new URL(href, "http://x").pathname;
}

describe("completed activities href", () => {
  it("points at the activities list and round-trips through the parser", () => {
    const href = buildCompletedActivitiesHref({
      owner: { kind: "user", userId: USER },
      pipelineId: PIPELINE,
      ...RANGE,
    });
    expect(href).not.toBeNull();
    expect(pathOf(href ?? "")).toBe("/activities/list");
    expect(parseDrillDown(paramsOf(href ?? ""), "completed")).toEqual({
      owner: USER,
      pipelineId: PIPELINE,
      ...RANGE,
    });
  });

  it("carries me and everyone as tokens and omits an unset pipeline", () => {
    const me = buildCompletedActivitiesHref({ owner: { kind: "me" }, pipelineId: null, ...RANGE });
    const all = buildCompletedActivitiesHref({
      owner: { kind: "all" },
      pipelineId: null,
      ...RANGE,
    });
    expect(parseDrillDown(paramsOf(me ?? ""), "completed")).toEqual({
      owner: "me",
      pipelineId: null,
      ...RANGE,
    });
    expect(parseDrillDown(paramsOf(all ?? ""), "completed")?.owner).toBe("all");
  });

  it("is not offered for a team scope", () => {
    expect(
      buildCompletedActivitiesHref({
        owner: { kind: "team", teamId: USER },
        pipelineId: null,
        ...RANGE,
      }),
    ).toBeNull();
  });
});

describe("won deals href", () => {
  it("points at the pipeline list and round-trips through the parser", () => {
    const href = buildWonDealsHref({ owner: { kind: "me" }, pipelineId: PIPELINE, ...RANGE });
    expect(pathOf(href ?? "")).toBe(`/pipeline/${PIPELINE}/list`);
    expect(parseDrillDown(paramsOf(href ?? ""), "won")).toEqual({
      owner: "me",
      pipelineId: PIPELINE,
      ...RANGE,
    });
  });

  it("is not offered across all pipelines or for a team", () => {
    expect(buildWonDealsHref({ owner: { kind: "me" }, pipelineId: null, ...RANGE })).toBeNull();
    expect(
      buildWonDealsHref({ owner: { kind: "team", teamId: USER }, pipelineId: PIPELINE, ...RANGE }),
    ).toBeNull();
  });
});

describe("parseDrillDown", () => {
  it("ignores a drill-down meant for the other list", () => {
    const href = buildWonDealsHref({ owner: { kind: "me" }, pipelineId: PIPELINE, ...RANGE });
    expect(parseDrillDown(paramsOf(href ?? ""), "completed")).toBeNull();
  });

  it("returns null without drill-down params or with a malformed one", () => {
    expect(parseDrillDown({}, "completed")).toBeNull();
    expect(
      parseDrillDown(
        { drill: "completed", owner: "me", from: "nope", to: "2026-01-01" },
        "completed",
      ),
    ).toBeNull();
    expect(
      parseDrillDown(
        { drill: "completed", owner: "team:x", from: RANGE.from, to: RANGE.to },
        "completed",
      ),
    ).toBeNull();
  });

  it("takes the first value of a repeated param", () => {
    expect(
      parseDrillDown(
        { drill: "completed", owner: ["all", "me"], from: RANGE.from, to: RANGE.to },
        "completed",
      )?.owner,
    ).toBe("all");
  });
});

describe("resolveDrillDownOwner", () => {
  it("resolves me to the actor, everyone to no owner, and keeps a user id", () => {
    expect(resolveDrillDownOwner("me", USER)).toBe(USER);
    expect(resolveDrillDownOwner("all", USER)).toBeNull();
    expect(resolveDrillDownOwner(PIPELINE, USER)).toBe(PIPELINE);
  });
});
