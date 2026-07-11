import { describe, expect, it } from "vitest";
import { type ActivityVisibilityInput, activityVisibilityFromParents } from "./activityVisibility";

const base: ActivityVisibilityInput = {
  dealId: null,
  personId: null,
  orgId: null,
  assigneeId: "assignee",
  deal: null,
  person: null,
  org: null,
  participantUserIds: [],
};

const contact = {
  ownerId: "owner",
  visibilityLevel: "group" as const,
  visibilityGroupId: "g1",
  visibleToUserIds: ["u2"],
};

describe("activityVisibilityFromParents", () => {
  it("derives visibility from the deal parent, carrying the pipeline gate", () => {
    const v = activityVisibilityFromParents({
      ...base,
      dealId: "d1",
      deal: { ...contact, pipelineVisibilityGroupId: "pg1", pipelineArchived: false },
    });
    expect(v).toEqual({
      kind: "activity",
      ownerId: "owner",
      visibilityLevel: "group",
      visibilityGroupId: "g1",
      visibleToUserIds: ["u2"],
      pipelineVisibilityGroupId: "pg1",
      assigneeId: "assignee",
    });
  });

  it("hides a deal-parented activity when the deal parent is missing or soft-deleted", () => {
    expect(activityVisibilityFromParents({ ...base, dealId: "d1", deal: null })).toBeNull();
  });

  it("hides a deal-parented activity on an archived pipeline", () => {
    const v = activityVisibilityFromParents({
      ...base,
      dealId: "d1",
      deal: { ...contact, pipelineVisibilityGroupId: null, pipelineArchived: true },
    });
    expect(v).toBeNull();
  });

  it("does not fall through to the person when the dominant deal parent is gone", () => {
    // dealId set + person present, but the deal is missing -> hidden, NOT person-visible.
    const v = activityVisibilityFromParents({
      ...base,
      dealId: "d1",
      personId: "p1",
      deal: null,
      person: contact,
    });
    expect(v).toBeNull();
  });

  it("derives visibility from the person parent with no pipeline gate", () => {
    const v = activityVisibilityFromParents({ ...base, personId: "p1", person: contact });
    expect(v?.ownerId).toBe("owner");
    expect(v?.pipelineVisibilityGroupId).toBeNull();
  });

  it("hides a person-parented activity when the person is missing", () => {
    expect(activityVisibilityFromParents({ ...base, personId: "p1", person: null })).toBeNull();
  });

  it("derives visibility from the org parent", () => {
    const v = activityVisibilityFromParents({ ...base, orgId: "o1", org: contact });
    expect(v?.visibilityGroupId).toBe("g1");
  });

  it("grants a parentless activity to its assignee and participants only", () => {
    const v = activityVisibilityFromParents({
      ...base,
      participantUserIds: ["p-user"],
    });
    expect(v).toEqual({
      kind: "activity",
      ownerId: null,
      visibilityLevel: "owner",
      visibilityGroupId: null,
      visibleToUserIds: ["assignee", "p-user"],
      pipelineVisibilityGroupId: null,
      assigneeId: "assignee",
    });
  });
});
