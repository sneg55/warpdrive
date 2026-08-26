// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

interface DayLoadInput {
  userId: string | null;
  from: string;
  to: string;
}
const useQuery = vi.fn((input: DayLoadInput) => ({ data: undefined, input }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: { activities: { dayLoad: { useQuery: (input: DayLoadInput) => useQuery(input) } } },
}));

import { DateRangeRow } from "./DateRangeRow";

afterEach(() => {
  cleanup();
  useQuery.mockClear();
});

function renderRow(assigneeId: string): void {
  render(
    <DateRangeRow
      startDate="2026-07-04"
      onStartDate={vi.fn()}
      startTime=""
      onStartTime={vi.fn()}
      endTime=""
      onEndTime={vi.fn()}
      endDate=""
      onEndDate={vi.fn()}
      assigneeId={assigneeId}
    />,
  );
}

it("loads the day load for the selected assignee, not the signed-in user", () => {
  renderRow("11111111-1111-1111-1111-111111111111");
  const inputs = useQuery.mock.calls.map(([input]) => input);
  expect(inputs.every((i) => i.userId === "11111111-1111-1111-1111-111111111111")).toBe(true);
  expect(inputs.length).toBeGreaterThan(0);
});

it("falls back to the signed-in user when no assignee is selected", () => {
  renderRow("");
  expect(useQuery.mock.calls[0]?.[0].userId).toBeNull();
  expect(screen.getByLabelText("Start date")).toBeInTheDocument();
});
