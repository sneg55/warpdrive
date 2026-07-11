// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarActivity } from "@/features/activities/calendar";
import { ActivityCard } from "./ActivityCard";

const completeActivityAction = vi.fn((...args: unknown[]) => {
  void args;
  return Promise.resolve({ ok: true as const, value: { id: "a1" } });
});
vi.mock("@/features/activities/actions", () => ({
  completeActivityAction: (...args: unknown[]) => completeActivityAction(...args),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

// ActivityCard optimistically updates the listForEntity cache (instant Focus->History move) and
// invalidates it to reconcile / roll back.
const setData = vi.fn();
const invalidate = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: { useUtils: () => ({ activities: { listForEntity: { setData, invalidate } } }) },
}));

// Failed completions surface the shared error modal instead of reverting silently.
const reportError = vi.fn();
vi.mock("@/features/deal-workspace/DealActionErrorProvider", () => ({
  useDealActionError: () => reportError,
}));

afterEach(cleanup);
beforeEach(() => {
  completeActivityAction.mockClear();
  setData.mockClear();
  invalidate.mockClear();
  reportError.mockClear();
});

function makeActivity(over: Partial<CalendarActivity> = {}): CalendarActivity {
  return {
    id: "a1",
    subject: "Discovery call",
    dueAt: new Date("2026-07-02T10:00:00Z"),
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

describe("ActivityCard", () => {
  it("shows created-by owner and links the person and organization", () => {
    render(<ActivityCard activity={makeActivity()} at={AT} />);
    expect(screen.getByText("Discovery call")).toBeInTheDocument();
    expect(screen.getByText(/Nick Sawinyh/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /person/i })).toHaveAttribute(
      "href",
      "/contacts/people/p1",
    );
    expect(screen.getByRole("link", { name: /organization/i })).toHaveAttribute(
      "href",
      "/contacts/orgs/o1",
    );
  });

  it("humanizes an email-shaped owner name instead of showing the raw email", () => {
    render(<ActivityCard activity={makeActivity({ ownerName: "demo1@example.com" })} at={AT} />);
    expect(screen.getByText(/Demo1/)).toBeInTheDocument();
    expect(screen.queryByText(/demo1@example\.com/)).not.toBeInTheDocument();
  });

  it("links the linked record's name, not the entity type word", () => {
    render(
      <ActivityCard
        activity={makeActivity({ personName: "Ada Lovelace", orgName: "Analytical Ltd" })}
        at={AT}
      />,
    );
    const personLink = screen.getByRole("link", { name: /linked person/i });
    expect(personLink).toHaveTextContent("Ada Lovelace");
    expect(personLink).not.toHaveTextContent("Person");
    expect(personLink).toHaveAttribute("href", "/contacts/people/p1");
    const orgLink = screen.getByRole("link", { name: /linked organization/i });
    expect(orgLink).toHaveTextContent("Analytical Ltd");
    expect(orgLink).toHaveAttribute("href", "/contacts/orgs/o1");
  });

  it("falls back to a generic label (no crash) when a linked record has no name", () => {
    render(<ActivityCard activity={makeActivity({ personName: null, orgName: null })} at={AT} />);
    expect(screen.getByRole("link", { name: /linked person/i })).toHaveTextContent("Person");
    expect(screen.getByRole("link", { name: /linked organization/i })).toHaveTextContent(
      "Organization",
    );
  });

  it("omits the person and organization links when absent", () => {
    render(<ActivityCard activity={makeActivity({ personId: null, orgId: null })} at={AT} />);
    expect(screen.queryByRole("link", { name: /person/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /organization/i })).not.toBeInTheDocument();
  });

  it("renders without crashing when ownerName is undefined (not just null)", () => {
    // Some CalendarActivity builders omit ownerName entirely, so it arrives undefined; the meta
    // line must not call formatUserName(undefined) and throw.
    render(<ActivityCard activity={makeActivity({ ownerName: undefined })} at={AT} />);
    expect(screen.getByText("Discovery call")).toBeInTheDocument();
  });

  it("shows the completion date AND time on a done activity (from doneAt)", () => {
    render(
      <ActivityCard
        activity={makeActivity({ done: true, doneAt: new Date("2026-07-06T20:42:00Z") })}
        at={AT}
      />,
    );
    const completed = screen.getByTestId("activity-completed");
    expect(completed).toHaveTextContent(/Completed/i);
    // A time component (h:mm) must be present, not just a date.
    expect(completed.textContent ?? "").toMatch(/\d{1,2}:\d{2}/);
  });

  it("omits the completion line for an open activity", () => {
    render(<ActivityCard activity={makeActivity({ done: false })} at={AT} />);
    expect(screen.queryByTestId("activity-completed")).not.toBeInTheDocument();
  });

  it("completes the activity via the checkbox and notifies onChanged", async () => {
    const onChanged = vi.fn();
    render(<ActivityCard activity={makeActivity()} at={AT} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /mark as done/i }));
    await waitFor(() => expect(completeActivityAction).toHaveBeenCalledTimes(1));
    expect(completeActivityAction.mock.calls[0]?.[0]).toMatchObject({ id: "a1", done: true });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("optimistically flips the activity's done in the listForEntity cache (instant move)", async () => {
    render(<ActivityCard activity={makeActivity()} at={AT} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /mark as done/i }));
    // The deal cache is updated immediately (before the server round-trip resolves).
    await waitFor(() => expect(setData).toHaveBeenCalled());
    const dealCall = setData.mock.calls.find(
      (c) => (c[0] as { entityType?: string }).entityType === "deal",
    );
    expect(dealCall?.[0]).toMatchObject({ entityType: "deal", entityId: "d1" });
    // Applying the optimistic updater to the current list flips this activity to done.
    const updater = dealCall?.[1] as (rows: CalendarActivity[]) => CalendarActivity[];
    const next = updater([makeActivity()]);
    expect(next[0]?.done).toBe(true);
    expect(next[0]?.doneAt).toBeInstanceOf(Date);
  });

  it("surfaces the error modal and rolls back when the completion is denied", async () => {
    completeActivityAction.mockResolvedValueOnce({
      ok: false as const,
      error: { id: "E_PERM_001" },
    } as never);
    render(<ActivityCard activity={makeActivity()} at={AT} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /mark as done/i }));
    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
    // Rollback: the optimistic cache change is reconciled by refetching the deal list.
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "deal", entityId: "d1" }),
    );
  });

  it("reopens a completed activity (sends done:false)", async () => {
    render(<ActivityCard activity={makeActivity({ done: true })} at={AT} />);
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(completeActivityAction).toHaveBeenCalledTimes(1));
    expect(completeActivityAction.mock.calls[0]?.[0]).toMatchObject({ id: "a1", done: false });
  });

  it("opens the overflow menu and marks done from it", async () => {
    const user = userEvent.setup();
    render(<ActivityCard activity={makeActivity()} at={AT} />);
    await user.click(screen.getByRole("button", { name: /more actions/i }));
    await user.click(screen.getByRole("menuitem", { name: /mark as done/i }));
    await waitFor(() => expect(completeActivityAction).toHaveBeenCalledTimes(1));
  });

  it("reopens via the overflow menu's Reopen item (sends done:false)", async () => {
    const user = userEvent.setup();
    render(<ActivityCard activity={makeActivity({ done: true })} at={AT} />);
    await user.click(screen.getByRole("button", { name: /more actions/i }));
    await user.click(screen.getByRole("menuitem", { name: /reopen/i }));
    await waitFor(() => expect(completeActivityAction).toHaveBeenCalledTimes(1));
    expect(completeActivityAction.mock.calls[0]?.[0]).toMatchObject({ id: "a1", done: false });
  });

  it("shows a reopen control, not a mark-as-done one, once done", () => {
    render(<ActivityCard activity={makeActivity({ done: true })} at={AT} />);
    expect(screen.queryByRole("checkbox", { name: /mark as done/i })).not.toBeInTheDocument();
  });

  it("renders location text and a note preview when present", () => {
    render(
      <ActivityCard
        activity={makeActivity({ location: "HQ", note: "<p>ring the bell</p>" })}
        at={AT}
      />,
    );
    expect(screen.getByText("HQ")).toBeInTheDocument();
    expect(screen.getByText("ring the bell")).toBeInTheDocument();
  });

  it("renders the activity note as a highlighted band (Pipedrive), not plain muted text", () => {
    render(<ActivityCard activity={makeActivity({ note: "<p>ring the bell</p>" })} at={AT} />);
    const band = screen.getByTestId("activity-note");
    expect(band).toHaveTextContent("ring the bell");
    // The band carries the note's amber tint (matching NoteCard) and a divider from the meta above.
    expect(band.className).toMatch(/bg-warning/);
    expect(band.className).toMatch(/border-t/);
  });

  it("renders the per-type icon for the activity", () => {
    const { container } = render(
      <ActivityCard activity={makeActivity({ typeKey: "call" })} at={AT} />,
    );
    // The card leads with the type glyph: the shared ActivityTypeIcon draws a stroked
    // (fill="none") svg, unlike the filled overflow-menu dots, so this targets the icon.
    expect(container.querySelector("svg[fill='none']")).not.toBeNull();
  });

  it("renders an OVERDUE badge with the destructive treatment when overdue", () => {
    render(<ActivityCard activity={makeActivity({ overdue: true })} at={AT} />);
    const badge = screen.getByText(/overdue/i);
    expect(badge).toHaveClass("text-destructive");
  });

  it("renders the due date in the destructive color when overdue (PD reddens the date too)", () => {
    render(<ActivityCard activity={makeActivity({ overdue: true })} at={AT} />);
    expect(screen.getByTestId("activity-date")).toHaveClass("text-destructive");
  });

  it("keeps the due date muted (not destructive) when not overdue", () => {
    render(<ActivityCard activity={makeActivity({ overdue: false })} at={AT} />);
    expect(screen.getByTestId("activity-date")).not.toHaveClass("text-destructive");
  });

  it("omits the OVERDUE badge when the activity is not overdue", () => {
    render(<ActivityCard activity={makeActivity({ overdue: false })} at={AT} />);
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument();
  });

  it("renders the duration when durationMinutes is set", () => {
    render(<ActivityCard activity={makeActivity({ durationMinutes: 30 })} at={AT} />);
    expect(screen.getByText(/30 min/i)).toBeInTheDocument();
  });

  it("omits the duration when durationMinutes is null", () => {
    render(<ActivityCard activity={makeActivity({ durationMinutes: null })} at={AT} />);
    expect(screen.queryByText(/min/i)).not.toBeInTheDocument();
  });

  it("omits location and note blocks when absent", () => {
    render(<ActivityCard activity={makeActivity({ location: null, note: null })} at={AT} />);
    expect(screen.queryByText("HQ")).not.toBeInTheDocument();
  });

  it("omits location and note blocks when empty strings (no empty divs)", () => {
    const { container } = render(
      <ActivityCard activity={makeActivity({ location: "", note: "" })} at={AT} />,
    );
    // The guard handles null AND "": an empty-string note/location must render nothing.
    expect(screen.queryByText("HQ")).not.toBeInTheDocument();
    // No stray empty div for the note (only the footer <p> lives in the text container).
    expect(container.querySelector("[data-empty-note]")).toBeNull();
    const emptyDivs = Array.from(container.querySelectorAll("div")).filter(
      (d) => d.children.length === 0 && d.textContent === "",
    );
    expect(emptyDivs).toHaveLength(0);
  });
});
