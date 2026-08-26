import { describe, expect, test } from "vitest";
import { goalInput } from "./schemas";

const base = {
  subject: "deal",
  action: "won",
  metric: "value",
  assigneeKind: "user",
  assigneeId: "11111111-1111-4111-8111-111111111111",
  pipelineId: null,
  activityTypeId: null,
  interval: "monthly",
  target: "50000.00",
  startsOn: "2026-01-01",
  endsOn: null,
};

describe("goalInput", () => {
  test("accepts a deal value goal for one user", () => {
    expect(goalInput.safeParse(base).success).toBe(true);
  });

  test("accepts an activity count goal narrowed to one type", () => {
    const r = goalInput.safeParse({
      ...base,
      subject: "activity",
      action: "completed",
      metric: "count",
      activityTypeId: "22222222-2222-4222-8222-222222222222",
      target: "40",
    });
    expect(r.success).toBe(true);
  });

  // An activity has no monetary value, so a value goal on one is meaningless rather than zero.
  test("rejects a value metric on an activity goal", () => {
    const r = goalInput.safeParse({
      ...base,
      subject: "activity",
      action: "completed",
      metric: "value",
    });
    expect(r.success).toBe(false);
  });

  test("rejects an activity goal that counts wins", () => {
    const r = goalInput.safeParse({ ...base, subject: "activity", action: "won", metric: "count" });
    expect(r.success).toBe(false);
  });

  test("rejects a deal goal that counts completions", () => {
    const r = goalInput.safeParse({ ...base, action: "completed" });
    expect(r.success).toBe(false);
  });

  test("rejects an activity type on a deal goal", () => {
    const r = goalInput.safeParse({
      ...base,
      activityTypeId: "22222222-2222-4222-8222-222222222222",
    });
    expect(r.success).toBe(false);
  });

  test("requires an assignee id for a user goal", () => {
    const r = goalInput.safeParse({ ...base, assigneeId: null });
    expect(r.success).toBe(false);
  });

  test("rejects an assignee id on a company-wide goal", () => {
    const r = goalInput.safeParse({ ...base, assigneeKind: "company" });
    expect(r.success).toBe(false);
  });

  test("accepts a company-wide goal with no assignee", () => {
    const r = goalInput.safeParse({ ...base, assigneeKind: "company", assigneeId: null });
    expect(r.success).toBe(true);
  });

  test("rejects a target of zero, which no progress bar can express", () => {
    expect(goalInput.safeParse({ ...base, target: "0" }).success).toBe(false);
  });

  test("rejects a negative target", () => {
    expect(goalInput.safeParse({ ...base, target: "-5" }).success).toBe(false);
  });

  // A count goal moves one whole deal at a time, so a fractional target can never be met.
  test("rejects a fractional target on a count goal", () => {
    const r = goalInput.safeParse({ ...base, metric: "count", target: "1.5" });
    expect(r.success).toBe(false);
  });

  test("still accepts a fractional target on a value goal", () => {
    expect(goalInput.safeParse({ ...base, target: "1500.50" }).success).toBe(true);
  });

  test("rejects an end date before the start date", () => {
    const r = goalInput.safeParse({ ...base, startsOn: "2026-06-01", endsOn: "2026-01-01" });
    expect(r.success).toBe(false);
  });
});
