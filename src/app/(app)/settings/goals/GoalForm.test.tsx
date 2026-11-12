// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_STRINGS } from "@/constants/settingsStrings";
import type { Goal } from "@/db/schema/goals";
import { GoalForm } from "./GoalForm";

afterEach(cleanup);

const goal: Goal = {
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
};

describe("GoalForm", () => {
  it("opens an edited count target as the whole number it was entered as", () => {
    render(
      <GoalForm
        users={[]}
        teams={[]}
        pipelines={[]}
        activityTypes={[]}
        initial={goal}
        submitLabel="Save"
        onSubmit={() => Promise.resolve({ ok: true })}
        onDone={() => {}}
      />,
    );
    expect(screen.getByLabelText(SETTINGS_STRINGS.goalTarget)).toHaveValue("200");
  });

  it.each([
    ["user", SETTINGS_STRINGS.goalPickPerson],
    ["team", SETTINGS_STRINGS.goalPickTeam],
  ] as const)("asks for the %s instead of calling the action when none is chosen", async (kind, message) => {
    const onSubmit = vi.fn(() => Promise.resolve({ ok: true }));
    render(
      <GoalForm
        users={[{ id: "u1", name: "Ann" }]}
        teams={[{ id: "t1", name: "Sales" }]}
        pipelines={[]}
        activityTypes={[]}
        initial={{ ...goal, assigneeKind: kind }}
        submitLabel="Save"
        onSubmit={onSubmit}
        onDone={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByText(SETTINGS_STRINGS.goalInvalid)).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
