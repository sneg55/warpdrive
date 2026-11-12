// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { STRINGS } from "@/constants/strings";
import type { OwnerScope } from "@/types/stats";
import { buildCompletedActivitiesHref, buildWonDealsHref } from "../drillDownHref";
import { Scoreboard } from "./Scoreboard";

afterEach(cleanup);

const PIPELINE = "0b8e9c1d-2a3b-4c5d-9e0f-abcdef012345";
const USER = "6f1c2a3e-1b2c-4d5e-8f90-123456789abc";
const TEAM = "1c9f0d2e-3b4c-4d6e-8f10-bcdef0123456";

function renderFor(owner: OwnerScope, pipelineId: string | null) {
  render(
    <Scoreboard
      deals={{
        added: { count: 5, value: "0.00" },
        won: { count: 3, value: "0.00" },
        lost: { count: 1, value: "0.00" },
        open: { count: 9, value: "0.00" },
      }}
      won={{ avgValue: null, medianValue: null, avgCycleDays: null, medianCycleDays: null }}
      activities={{ completed: 12, added: 20, scheduled: 4, undated: 0 }}
      winRate={null}
      currency="USD"
      drillDown={{ owner, pipelineId, from: "2026-01-01", to: "2026-12-31" }}
    />,
  );
}

function linkNamed(label: string): HTMLElement | null {
  return screen.queryByRole("link", { name: new RegExp(label) });
}

describe("Scoreboard drill-down links", () => {
  it.each<[string, OwnerScope]>([
    ["me", { kind: "me" }],
    ["a named user", { kind: "user", userId: USER }],
    ["everyone", { kind: "all" }],
  ])("links both tiles for %s on a single pipeline", (_label, owner) => {
    renderFor(owner, PIPELINE);
    const source = { owner, pipelineId: PIPELINE, from: "2026-01-01", to: "2026-12-31" };
    expect(linkNamed(STRINGS.dashboard.scoreActivities)).toHaveAttribute(
      "href",
      buildCompletedActivitiesHref(source),
    );
    expect(linkNamed(STRINGS.dashboard.scoreWon)).toHaveAttribute(
      "href",
      buildWonDealsHref(source),
    );
  });

  it("links only the activities tile across all pipelines", () => {
    renderFor({ kind: "me" }, null);
    expect(linkNamed(STRINGS.dashboard.scoreActivities)).not.toBeNull();
    expect(linkNamed(STRINGS.dashboard.scoreWon)).toBeNull();
    expect(screen.getByText(STRINGS.dashboard.scoreWon)).toBeInTheDocument();
  });

  it("links neither tile for a team", () => {
    renderFor({ kind: "team", teamId: TEAM }, PIPELINE);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText("12")).toBeInTheDocument();
  });
});
