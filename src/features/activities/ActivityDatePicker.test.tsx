// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

const useQuery = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: { activities: { dayLoad: { useQuery: (...args: unknown[]) => useQuery(...args) } } },
}));

import { ActivityDatePicker } from "./ActivityDatePicker";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  useQuery.mockReset();
});

function loaded(counts: Record<string, number>, target = 5): void {
  useQuery.mockReturnValue({ data: { counts, target } });
}

async function openOn(value: string): Promise<void> {
  render(<ActivityDatePicker value={value} onChange={vi.fn()} ariaLabel="Start date" />);
  fireEvent.click(screen.getByLabelText("Start date"));
  await screen.findByText("15");
}

function dayButton(dayOfMonth: string): HTMLElement | null {
  return screen.getByText(dayOfMonth).closest("button");
}

it("colors each day by how full it is against the target", async () => {
  loaded({ "2026-07-14": 2, "2026-07-15": 4, "2026-07-16": 6 });
  await openOn("2026-07-04");
  expect(dayButton("14")?.querySelector(".bg-emerald-500")).not.toBeNull();
  expect(dayButton("15")?.querySelector(".bg-amber-500")).not.toBeNull();
  expect(dayButton("16")?.querySelector(".bg-red-500")).not.toBeNull();
});

it("leaves an empty day undecorated", async () => {
  loaded({ "2026-07-15": 4 });
  await openOn("2026-07-04");
  expect(dayButton("17")?.querySelector("span[class*='bg-']")).toBeNull();
});

it("names the exact count and target on a loaded day", async () => {
  loaded({ "2026-07-15": 1 });
  await openOn("2026-07-04");
  expect(dayButton("15")).toHaveAccessibleName(/1 activity scheduled, daily target 5/);
});

it("asks the server to bucket days in the viewer's own timezone", () => {
  loaded({});
  render(<ActivityDatePicker value="2026-07-04" onChange={vi.fn()} ariaLabel="Start date" />);
  const [input] = useQuery.mock.calls[0] as [{ timeZone: string }];
  expect(input.timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
});

it("pads the range past the grid so a local day is never half-covered", () => {
  loaded({});
  render(<ActivityDatePicker value="2026-07-04" onChange={vi.fn()} ariaLabel="Start date" />);
  const [input] = useQuery.mock.calls[0] as [{ from: string; to: string }];
  expect(input.from < "2026-06-29").toBe(true);
  expect(input.to > "2026-08-09").toBe(true);
});

it("queries the month the calendar shows, not the UTC month of its local first day", () => {
  loaded({});
  render(<ActivityDatePicker value="2026-08-01" onChange={vi.fn()} ariaLabel="Start date" />);
  const [input] = useQuery.mock.calls[0] as [{ from: string; to: string }];
  expect(input.to > "2026-08-31").toBe(true);
});

it("drops a remembered month once the calendar is closed and reopened", async () => {
  loaded({});
  render(<ActivityDatePicker value="2026-07-04" onChange={vi.fn()} ariaLabel="Start date" />);
  fireEvent.click(screen.getByLabelText("Start date"));
  fireEvent.click(await screen.findByRole("button", { name: "Go to the Next Month" }));
  const navigatedInput = useQuery.mock.calls.at(-1) as [{ from: string }];
  expect(navigatedInput[0].from > "2026-07-15").toBe(true);
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  await waitFor(() => {
    const latest = useQuery.mock.calls.at(-1) as [{ from: string }];
    expect(latest[0].from < "2026-07-01").toBe(true);
  });
});

it("follows the value into another month instead of holding the first month's counts", () => {
  loaded({});
  const { rerender } = render(
    <ActivityDatePicker value="2026-07-04" onChange={vi.fn()} ariaLabel="Start date" />,
  );
  rerender(<ActivityDatePicker value="2026-11-20" onChange={vi.fn()} ariaLabel="Start date" />);
  const last = useQuery.mock.calls.at(-1) as [{ from: string; to: string }];
  expect(last[0].from > "2026-10-01").toBe(true);
  expect(last[0].to > "2026-11-20").toBe(true);
});

it("asks for the visible month's range, scoped to the assignee", () => {
  loaded({});
  render(
    <ActivityDatePicker
      value="2026-07-04"
      onChange={vi.fn()}
      ariaLabel="Start date"
      assigneeId="11111111-1111-1111-1111-111111111111"
    />,
  );
  const [input] = useQuery.mock.calls[0] as [{ userId: string | null; from: string; to: string }];
  expect(input.userId).toBe("11111111-1111-1111-1111-111111111111");
  expect(input.from < "2026-07-01").toBe(true);
  expect(input.to > "2026-07-31").toBe(true);
});

it("reloads for the new month after the user navigates", async () => {
  loaded({});
  render(<ActivityDatePicker value="2026-07-04" onChange={vi.fn()} ariaLabel="Start date" />);
  fireEvent.click(screen.getByLabelText("Start date"));
  fireEvent.click(await screen.findByRole("button", { name: "Go to the Next Month" }));
  const last = useQuery.mock.calls.at(-1) as [{ from: string; to: string }];
  expect(last[0].from > "2026-07-15").toBe(true);
});

it("renders no dots while the counts are still loading", async () => {
  useQuery.mockReturnValue({ data: undefined });
  await openOn("2026-07-04");
  expect(dayButton("15")?.querySelector("span[class*='bg-']")).toBeNull();
});
