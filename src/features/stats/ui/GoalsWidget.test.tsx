// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { STRINGS } from "@/constants/strings";
import { GoalsWidget } from "./GoalsWidget";

afterEach(cleanup);

describe("GoalsWidget", () => {
  // The link is most useful exactly when there are no goals, so an empty state that swallows
  // it leaves an admin with nowhere to go.
  it("still offers the setup link when there are no goals", () => {
    render(<GoalsWidget data={[]} currency="USD" canManage />);
    expect(screen.getByText(STRINGS.dashboard.emptyGoals)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: STRINGS.dashboard.goalsSettingsLink }).getAttribute("href"),
    ).toBe("/settings/goals");
  });

  // "Set up goals" was bare text on a bare sentence: nothing said what a goal is, and nothing
  // marked the words as something you could click.
  it("explains what a goal is and gives the link a button affordance", () => {
    render(<GoalsWidget data={[]} currency="USD" canManage />);
    expect(screen.getByRole("status")).toHaveTextContent(STRINGS.dashboard.emptyGoalsBody);
    const link = screen.getByRole("link", { name: STRINGS.dashboard.goalsSettingsLink });
    expect(link.className).toContain("bg-action");
  });

  it("hides the setup link from someone who cannot manage goals", () => {
    render(<GoalsWidget data={[]} currency="USD" canManage={false} />);
    expect(screen.queryByRole("link", { name: STRINGS.dashboard.goalsSettingsLink })).toBeNull();
  });
});
