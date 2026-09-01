// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarActivity } from "@/features/activities/calendar";
import { ActivityCard } from "./ActivityCard";

const completeActivityAction = vi.fn((...args: unknown[]) => {
  void args;
  return Promise.resolve({ ok: true as const, value: { id: "a1" } });
});
vi.mock("@/features/activities/actions", () => ({
  completeActivityAction: (...args: unknown[]) => completeActivityAction(...args),
  deleteActivityAction: () => Promise.resolve({ ok: true as const, value: { id: "a1" } }),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const setData = vi.fn();
const invalidate = vi.fn();
const invalidateDayLoad = vi.fn(() => Promise.resolve());
const invalidateListRows = vi.fn(() => Promise.resolve());
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      activities: {
        listForEntity: { setData, invalidate },
        dayLoad: { invalidate: invalidateDayLoad },
        listRows: { invalidate: invalidateListRows },
      },
    }),
  },
}));

const reportError = vi.fn();
vi.mock("@/features/deal-workspace/DealActionErrorProvider", () => ({
  useDealActionError: () => reportError,
}));

afterEach(cleanup);
beforeEach(() => {
  completeActivityAction.mockClear();
  setData.mockClear();
  invalidate.mockClear();
  invalidateDayLoad.mockClear();
  invalidateListRows.mockClear();
  reportError.mockClear();
});

function makeActivity(over: Partial<CalendarActivity> = {}): CalendarActivity {
  return {
    id: "a1",
    subject: "Discovery call",
    dueAt: new Date("2026-07-02T10:00:00Z"),
    allDay: false,
    durationMinutes: null,
    typeKey: "call",
    done: false,
    dealId: "d1",
    personId: "p1",
    orgId: "o1",
    overdue: false,
    ownerName: "Nick Sawinyh",
    ...over,
  };
}

const AT = new Date("2026-07-02T10:00:00Z");

describe("ActivityCard completion invalidates the activity lists", () => {
  it("refreshes the Activities table so a completed activity leaves the open list", async () => {
    render(<ActivityCard activity={makeActivity()} at={AT} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /mark as done/i }));
    await waitFor(() => expect(invalidateListRows).toHaveBeenCalledTimes(1));
  });

  it("refreshes the calendar day load so the completed activity restyles there too", async () => {
    render(<ActivityCard activity={makeActivity()} at={AT} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /mark as done/i }));
    await waitFor(() => expect(invalidateDayLoad).toHaveBeenCalledTimes(1));
  });

  it("reopening a done activity refreshes the lists as well", async () => {
    render(<ActivityCard activity={makeActivity({ done: true })} at={AT} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /reopen activity/i }));
    await waitFor(() => expect(invalidateListRows).toHaveBeenCalledTimes(1));
  });

  it("does not refresh the lists when the completion fails", async () => {
    completeActivityAction.mockResolvedValueOnce({
      ok: false,
      error: { id: "E_ACTIVITY_001" },
    } as never);
    render(<ActivityCard activity={makeActivity()} at={AT} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /mark as done/i }));
    await waitFor(() => expect(reportError).toHaveBeenCalledTimes(1));
    expect(invalidateListRows).not.toHaveBeenCalled();
    expect(invalidateDayLoad).not.toHaveBeenCalled();
  });
});
