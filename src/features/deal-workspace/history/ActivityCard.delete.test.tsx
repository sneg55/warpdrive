// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarActivity } from "@/features/activities/calendar";
import { ActivityCard } from "./ActivityCard";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

const deleteActivityAction = vi.fn((...args: unknown[]) => {
  void args;
  return Promise.resolve({ ok: true as const, value: { id: "a1" } });
});
vi.mock("@/features/activities/actions", () => ({
  completeActivityAction: () => Promise.resolve({ ok: true as const, value: { id: "a1" } }),
  deleteActivityAction: (...args: unknown[]) => deleteActivityAction(...args),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const setData = vi.fn();
const invalidate = vi.fn();
const invalidateDayLoad = vi.fn(() => Promise.resolve());
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      activities: {
        listForEntity: { setData, invalidate },
        dayLoad: { invalidate: invalidateDayLoad },
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
  vi.clearAllMocks();
});

const AT = new Date("2026-07-02T10:00:00Z");

function makeActivity(over: Partial<CalendarActivity> = {}): CalendarActivity {
  return {
    id: "a1",
    subject: "Discovery call",
    dueAt: AT,
    allDay: false,
    durationMinutes: null,
    typeKey: "call",
    done: false,
    dealId: "d1",
    personId: null,
    orgId: null,
    overdue: false,
    ownerName: "Nick",
    ...over,
  };
}

// Opens the "..." overflow and picks Delete, returning the confirmation it raises.
async function openDeleteConfirm(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(screen.getByRole("button", { name: /more actions/i }));
  await user.click(screen.getByRole("menuitem", { name: "Delete" }));
  return await screen.findByRole("alertdialog");
}

describe("ActivityCard delete", () => {
  it("offers Delete in the More actions menu, styled as destructive", async () => {
    const user = userEvent.setup();
    render(<ActivityCard activity={makeActivity()} at={AT} />);
    await user.click(screen.getByRole("button", { name: /more actions/i }));
    const item = screen.getByRole("menuitem", { name: "Delete" });
    expect(item).toBeInTheDocument();
    expect(item.className).toMatch(/text-destructive/);
  });

  it("raises an in-app confirm dialog, not a native browser confirm, and deletes nothing yet", async () => {
    const nativeConfirm = vi.spyOn(window, "confirm");
    const user = userEvent.setup();
    render(<ActivityCard activity={makeActivity()} at={AT} />);
    const dialog = await openDeleteConfirm(user);
    expect(within(dialog).getByText(/delete activity/i)).toBeInTheDocument();
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(deleteActivityAction).not.toHaveBeenCalled();
  });

  it("confirming calls deleteActivityAction with the activity id and notifies onChanged", async () => {
    const onChanged = vi.fn();
    const user = userEvent.setup();
    render(<ActivityCard activity={makeActivity()} at={AT} onChanged={onChanged} />);
    const dialog = await openDeleteConfirm(user);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteActivityAction).toHaveBeenCalledWith({ id: "a1" }, "csrf"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("drops the activity from every timeline cache it appears in on success", async () => {
    const user = userEvent.setup();
    render(
      <ActivityCard
        activity={makeActivity({ personId: "p1", orgId: "o1" })}
        at={AT}
        onChanged={vi.fn()}
      />,
    );
    const dialog = await openDeleteConfirm(user);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(setData).toHaveBeenCalledTimes(3));
    const dealCall = setData.mock.calls.find(
      (c) => (c[0] as { entityType?: string }).entityType === "deal",
    );
    expect(dealCall?.[0]).toMatchObject({ entityType: "deal", entityId: "d1" });
    const updater = dealCall?.[1] as (rows: CalendarActivity[]) => CalendarActivity[];
    expect(updater([makeActivity(), makeActivity({ id: "a2" })])).toHaveLength(1);
  });

  it("invalidates the day load so the deleted activity stops colouring its day's dot", async () => {
    const user = userEvent.setup();
    render(<ActivityCard activity={makeActivity()} at={AT} onChanged={vi.fn()} />);
    const dialog = await openDeleteConfirm(user);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(invalidateDayLoad).toHaveBeenCalledTimes(1));
  });

  it("leaves the day load alone when the delete is denied", async () => {
    deleteActivityAction.mockResolvedValueOnce({
      ok: false as const,
      error: { id: "E_PERM_001" },
    } as never);
    const user = userEvent.setup();
    render(<ActivityCard activity={makeActivity()} at={AT} onChanged={vi.fn()} />);
    const dialog = await openDeleteConfirm(user);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
    expect(invalidateDayLoad).not.toHaveBeenCalled();
  });

  it("cancelling the confirmation deletes nothing", async () => {
    const onChanged = vi.fn();
    const user = userEvent.setup();
    render(<ActivityCard activity={makeActivity()} at={AT} onChanged={onChanged} />);
    const dialog = await openDeleteConfirm(user);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(deleteActivityAction).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByText("Discovery call")).toBeInTheDocument();
  });

  it("reports the error id and keeps the card when the delete is denied", async () => {
    deleteActivityAction.mockResolvedValueOnce({
      ok: false as const,
      error: { id: "E_PERM_001" },
    } as never);
    const onChanged = vi.fn();
    const user = userEvent.setup();
    render(<ActivityCard activity={makeActivity()} at={AT} onChanged={onChanged} />);
    const dialog = await openDeleteConfirm(user);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
    expect(onChanged).not.toHaveBeenCalled();
    expect(setData).not.toHaveBeenCalled();
    expect(screen.getByText("Discovery call")).toBeInTheDocument();
  });
});
