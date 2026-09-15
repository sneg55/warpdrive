// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => cleanup());

const useQuery = vi.fn((...args: unknown[]) => {
  void args;
  return { isLoading: true, isError: false, data: undefined };
});
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    stats: {
      dashboard: { useQuery: (input: unknown) => useQuery(input) },
      ownerOptions: {
        useQuery: () => ({
          data: {
            users: [
              { id: "u1", name: "Dana Scully", avatarUrl: null },
              { id: "u2", name: "Fox Mulder", avatarUrl: null },
            ],
            teams: [{ id: "t1", name: "West Coast" }],
          },
        }),
      },
    },
    goals: { list: { useQuery: () => ({ data: [] }) } },
    pipeline: {
      list: {
        useQuery: () => ({
          data: [
            { id: "p1", name: "Sales", stages: [] },
            { id: "p2", name: "Partners", stages: [] },
          ],
        }),
      },
    },
  },
}));

import { Dashboard } from "./Dashboard";

describe("Dashboard heading", () => {
  it("titles the screen 'Performance', not 'Dashboard'", () => {
    render(<Dashboard today="2026-03-01" canViewOthers currency="USD" />);
    expect(screen.getByRole("heading", { name: "Performance" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dashboard" })).not.toBeInTheDocument();
  });
});

describe("Dashboard date range", () => {
  it("passes a from/to range into the stats query and updates it when a date is picked", async () => {
    render(<Dashboard today="2026-03-01" canViewOthers currency="USD" />);
    // Default range is the current calendar year.
    const year = new Date().getFullYear();
    expect(useQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: `${year}-01-01`, to: `${year}-12-31` }),
    );
    fireEvent.click(screen.getByLabelText("Range start"));
    // Day buttons carry the full date as their aria-label (e.g. "Thursday,
    // January 15th, 2026"); the visible "15" is plain text content, so match
    // on text rather than accessible name (same convention as
    // AddActivityModal.test.tsx's DatePicker interactions).
    fireEvent.click((await screen.findAllByText("15"))[0]!);
    expect(useQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: expect.stringMatching(/-15$/) }),
    );
  });
});

describe("Dashboard pipeline switcher", () => {
  it("defaults to 'All pipelines' (null pipelineId) and offers the option", () => {
    // STATS-08: the dashboard defaults to aggregating across all visible pipelines
    // (null pipelineId), and "All pipelines" is a selectable option.
    useQuery.mockClear();
    render(<Dashboard today="2026-03-01" canViewOthers currency="USD" />);
    expect(useQuery).toHaveBeenLastCalledWith(expect.objectContaining({ pipelineId: null }));

    fireEvent.click(screen.getByLabelText("Pipeline"));
    expect(screen.getByRole("option", { name: "All pipelines" })).toBeInTheDocument();
  });

  it("rescopes to a specific pipeline and back to 'All pipelines' without reload", () => {
    useQuery.mockClear();
    render(<Dashboard today="2026-03-01" canViewOthers currency="USD" />);

    // Pick a specific pipeline: its id flows to the query.
    fireEvent.click(screen.getByLabelText("Pipeline"));
    fireEvent.click(screen.getByRole("option", { name: "Partners" }));
    expect(useQuery).toHaveBeenLastCalledWith(expect.objectContaining({ pipelineId: "p2" }));

    // Return to "All pipelines": pipelineId clears back to null in-session.
    fireEvent.click(screen.getByLabelText("Pipeline"));
    fireEvent.click(screen.getByRole("option", { name: "All pipelines" }));
    expect(useQuery).toHaveBeenLastCalledWith(expect.objectContaining({ pipelineId: null }));
  });
});

describe("Dashboard owner scope", () => {
  it("defaults to the viewer's own performance", () => {
    useQuery.mockClear();
    render(<Dashboard today="2026-03-01" canViewOthers currency="USD" />);
    expect(useQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ ownerScope: { kind: "me" } }),
    );
  });

  it("rescopes to one person", () => {
    useQuery.mockClear();
    render(<Dashboard today="2026-03-01" canViewOthers currency="USD" />);
    fireEvent.click(screen.getByLabelText("Owner"));
    fireEvent.click(screen.getByText("Fox Mulder"));
    expect(useQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ ownerScope: { kind: "user", userId: "u2" } }),
    );
  });

  it("rescopes to one team", () => {
    useQuery.mockClear();
    render(<Dashboard today="2026-03-01" canViewOthers currency="USD" />);
    fireEvent.click(screen.getByLabelText("Owner"));
    fireEvent.click(screen.getByText("West Coast"));
    expect(useQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ ownerScope: { kind: "team", teamId: "t1" } }),
    );
  });

  it("rescopes to everyone", () => {
    useQuery.mockClear();
    render(<Dashboard today="2026-03-01" canViewOthers currency="USD" />);
    fireEvent.click(screen.getByLabelText("Owner"));
    fireEvent.click(screen.getByText("Everyone"));
    expect(useQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ ownerScope: { kind: "all" } }),
    );
  });

  it("leaves the picker disabled for a viewer who cannot view others", () => {
    render(<Dashboard today="2026-03-01" canViewOthers={false} currency="USD" />);
    expect(screen.getByLabelText("Owner")).toBeDisabled();
  });
});
