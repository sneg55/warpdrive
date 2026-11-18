// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

import { STRINGS } from "@/constants/strings";
import type { StageConversionRow } from "@/types/stats";
import { FunnelWidget } from "./widgets";

const ROWS: StageConversionRow[] = [
  {
    stageId: "s1",
    name: "Qualified",
    order: 0,
    reached: 10,
    conversion: 1,
    medianDaysInStage: null,
  },
  {
    stageId: "s2",
    name: "Contact Made",
    order: 1,
    reached: 0,
    conversion: 0,
    medianDaysInStage: null,
  },
];

describe("FunnelWidget basis", () => {
  it("states that it counts only the viewer's own deals when the scope is 'me'", () => {
    render(<FunnelWidget data={ROWS} ownerScope={{ kind: "me" }} />);
    expect(screen.getByText(STRINGS.dashboard.funnelBasisMe)).toBeInTheDocument();
    expect(screen.queryByText(STRINGS.dashboard.funnelBasisAll)).toBeNull();
  });

  it("states that it counts every owner's deals when the scope is 'all'", () => {
    render(<FunnelWidget data={ROWS} ownerScope={{ kind: "all" }} />);
    expect(screen.getByText(STRINGS.dashboard.funnelBasisAll)).toBeInTheDocument();
    expect(screen.queryByText(STRINGS.dashboard.funnelBasisMe)).toBeNull();
  });

  it("keeps stating its basis when later stages read zero", () => {
    render(<FunnelWidget data={ROWS} ownerScope={{ kind: "me" }} />);
    expect(screen.getByRole("progressbar", { name: "Contact Made" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    expect(screen.getByText(STRINGS.dashboard.funnelBasisMe)).toBeInTheDocument();
  });

  it("says nothing about a basis when there is no cohort at all", () => {
    render(<FunnelWidget data={[]} ownerScope={{ kind: "me" }} />);
    expect(screen.getByText(STRINGS.dashboard.emptyFunnel)).toBeInTheDocument();
    expect(screen.queryByText(STRINGS.dashboard.funnelBasisMe)).toBeNull();
  });

  it("names the selected person as the basis when the scope is one user", () => {
    render(<FunnelWidget data={ROWS} ownerScope={{ kind: "user", userId: "u-1" }} />);
    expect(screen.getByText(STRINGS.dashboard.funnelBasisUser)).toBeInTheDocument();
    expect(screen.queryByText(STRINGS.dashboard.funnelBasisMe)).toBeNull();
    expect(screen.queryByText(STRINGS.dashboard.funnelBasisAll)).toBeNull();
  });

  it("names the selected team as the basis when the scope is one team", () => {
    render(<FunnelWidget data={ROWS} ownerScope={{ kind: "team", teamId: "t-1" }} />);
    expect(screen.getByText(STRINGS.dashboard.funnelBasisTeam)).toBeInTheDocument();
    expect(screen.queryByText(STRINGS.dashboard.funnelBasisAll)).toBeNull();
  });
});
