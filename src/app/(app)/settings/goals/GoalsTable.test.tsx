// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Goal } from "@/db/schema/goals";
import { GoalsTable } from "./GoalsTable";

afterEach(cleanup);

function goal(overrides: Partial<Goal>): Goal {
  return {
    id: "g1",
    subject: "activity",
    action: "completed",
    metric: "count",
    assigneeKind: "company",
    assigneeId: null,
    pipelineId: null,
    activityTypeId: null,
    interval: "monthly",
    target: "200.00",
    startsOn: "2026-08-24",
    endsOn: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe("GoalsTable", () => {
  it("states a count target as a whole number", () => {
    render(
      <GoalsTable goals={[goal({})]} assigneeNames={{}} onChanged={() => {}} onEdit={() => {}} />,
    );
    expect(screen.getByText("200")).toBeInTheDocument();
  });

  it("drops the empty cents from a whole-money target", () => {
    render(
      <GoalsTable
        goals={[goal({ subject: "deal", action: "won", metric: "value", target: "20000.00" })]}
        assigneeNames={{}}
        onChanged={() => {}}
        onEdit={() => {}}
      />,
    );
    expect(screen.getByText("20,000")).toBeInTheDocument();
  });
});
