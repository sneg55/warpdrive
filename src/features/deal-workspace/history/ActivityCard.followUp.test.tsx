// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarActivity } from "@/features/activities/calendar";
import { FollowUpPromptProvider } from "@/features/activities/followUpAfterDone";
import {
  INTERFACE_PREFS_DEFAULT,
  InterfacePrefsProvider,
} from "@/features/identity/InterfacePrefsProvider";
import { ActivityCard } from "./ActivityCard";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  global.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
});
vi.mock("@/features/email/composer/RichTextBodyLazy", () => ({
  RichTextBody: ({ onChange }: { onChange: (h: string) => void }) => (
    <textarea aria-label="Note" onChange={(e) => onChange(e.target.value)} />
  ),
}));

const completeActivityAction = vi.fn((...args: unknown[]) => {
  void args;
  return Promise.resolve({ ok: true as const, value: { id: "a1" } });
});
const createActivityAction = vi.fn(() =>
  Promise.resolve({ ok: true as const, value: { id: "a2" } }),
);
vi.mock("@/features/activities/actions", () => ({
  completeActivityAction: (...args: unknown[]) => completeActivityAction(...args),
  createActivityAction: (...args: unknown[]) => createActivityAction(...(args as [])),
  editActivityAction: vi.fn(),
  deleteActivityAction: () => Promise.resolve({ ok: true as const, value: { id: "a1" } }),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const setData = vi.fn();
const invalidate = vi.fn(() => Promise.resolve());
const invalidateLeadTimeline = vi.fn(() => Promise.resolve());
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      activities: {
        listForEntity: { setData, invalidate },
        dayLoad: { invalidate: () => Promise.resolve() },
        listRows: { invalidate: () => Promise.resolve() },
      },
      lead: { leadTimeline: { invalidate: invalidateLeadTimeline } },
      contacts: {
        contactTimeline: { invalidate: () => Promise.resolve() },
        activityStats: { invalidate: () => Promise.resolve() },
      },
    }),
    activities: {
      listTypes: { useQuery: () => ({ data: [{ id: "t1", key: "call", name: "Call" }] }) },
      dayLoad: { useQuery: () => ({ data: undefined }) },
      availability: { useQuery: () => ({ data: { busy: false } }) },
    },
    identity: { assignableUsers: { useQuery: () => ({ data: [{ id: "u1", name: "Me" }] }) } },
    contacts: { listPeopleForOrg: { useQuery: () => ({ data: [] }) } },
  },
}));

const reportError = vi.fn();
vi.mock("@/features/deal-workspace/DealActionErrorProvider", () => ({
  useDealActionError: () => reportError,
}));

afterEach(cleanup);
beforeEach(() => {
  completeActivityAction.mockClear();
  createActivityAction.mockClear();
  invalidate.mockClear();
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

function Wrap({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <InterfacePrefsProvider
      value={{ ...INTERFACE_PREFS_DEFAULT, scheduleFollowUpAfterDone: enabled }}
    >
      <FollowUpPromptProvider>{children}</FollowUpPromptProvider>
    </InterfacePrefsProvider>
  );
}

function renderCard(enabled: boolean, activity = makeActivity(), onChanged?: () => void): void {
  render(
    <Wrap enabled={enabled}>
      <ActivityCard activity={activity} at={AT} onChanged={onChanged} />
    </Wrap>,
  );
}

function FocusFeed(): React.ReactNode {
  const [done, setDone] = useState(false);
  return done ? (
    <p>Nothing needs your attention</p>
  ) : (
    <ActivityCard activity={makeActivity()} at={AT} onChanged={() => setDone(true)} />
  );
}

describe("ActivityCard follow-up prompt after mark-done", () => {
  it("opens the add-activity prompt after a successful mark-done when the preference is on", async () => {
    renderCard(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /mark as done/i }));
    expect(await screen.findByRole("dialog", { name: "Add activity" })).toBeInTheDocument();
  });

  it("still prompts when completing moves the card out of the Focus feed (card unmounts)", async () => {
    render(
      <Wrap enabled={true}>
        <FocusFeed />
      </Wrap>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /mark as done/i }));
    await screen.findByText("Nothing needs your attention");
    expect(await screen.findByRole("dialog", { name: "Add activity" })).toBeInTheDocument();
  });

  it("links the follow-up to the completed activity's deal, person and organization", async () => {
    const onChanged = vi.fn();
    renderCard(true, makeActivity(), onChanged);
    fireEvent.click(screen.getByRole("checkbox", { name: /mark as done/i }));
    await screen.findByRole("dialog", { name: "Add activity" });
    onChanged.mockClear();
    invalidate.mockClear();
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Send proposal" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(createActivityAction).toHaveBeenCalledWith(
        expect.objectContaining({ dealId: "d1", personId: "p1", orgId: "o1" }),
        "csrf",
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(invalidate).toHaveBeenCalledWith({ entityType: "deal", entityId: "d1" });
    expect(onChanged).toHaveBeenCalled();
  });

  it("links a lead activity's follow-up to the lead and refreshes the lead timeline", async () => {
    renderCard(true, makeActivity({ dealId: null, personId: null, orgId: null, leadId: "l1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /mark as done/i }));
    await screen.findByRole("dialog", { name: "Add activity" });
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Qualify" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(createActivityAction).toHaveBeenCalledWith(
        expect.objectContaining({ leadId: "l1", dealId: null }),
        "csrf",
      ),
    );
    await waitFor(() => expect(invalidateLeadTimeline).toHaveBeenCalledWith({ leadId: "l1" }));
  });

  it("does not prompt when the preference is off", async () => {
    renderCard(false);
    fireEvent.click(screen.getByRole("checkbox", { name: /mark as done/i }));
    await waitFor(() => expect(completeActivityAction).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not prompt when reopening a done activity", async () => {
    renderCard(true, makeActivity({ done: true }));
    fireEvent.click(screen.getByRole("checkbox", { name: /reopen activity/i }));
    await waitFor(() => expect(completeActivityAction).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not prompt when the mark-done fails", async () => {
    completeActivityAction.mockResolvedValueOnce({
      ok: false,
      error: { id: "E_ACTIVITY_001" },
    } as never);
    renderCard(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /mark as done/i }));
    await waitFor(() => expect(reportError).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
