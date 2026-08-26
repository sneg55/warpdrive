// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CalendarActivity } from "@/features/activities/calendar";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push }) }));

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    activities: {
      listTypes: {
        useQuery: () => ({ data: [{ id: "t1", key: "call", name: "Call" }] }),
      },
    },
  },
}));

vi.mock("@/features/activities/AddActivityModal", () => ({
  AddActivityModal: ({
    defaultDate,
    defaultTime,
    onClose,
  }: {
    defaultDate?: string;
    defaultTime?: string;
    onClose: () => void;
  }) => (
    <div data-testid="add-modal">
      <span data-testid="add-modal-date">{defaultDate}</span>
      <span data-testid="add-modal-time">{defaultTime}</span>
      <button type="button" onClick={onClose}>
        Close add
      </button>
    </div>
  ),
}));

vi.mock("@/features/activities/ActivityEditModal", () => ({
  ActivityEditModal: ({
    activity,
    onClose,
  }: {
    activity: { id: string; allDay: boolean; assigneeId?: string | null };
    onClose: () => void;
  }) => (
    <div data-testid="edit-modal">
      <span data-testid="edit-modal-id">{activity.id}</span>
      <span data-testid="edit-modal-assignee">{activity.assigneeId ?? ""}</span>
      <span data-testid="edit-modal-allday">{String(activity.allDay)}</span>
      <button type="button" onClick={onClose}>
        Close edit
      </button>
    </div>
  ),
}));

import { DEFAULT_START_HOUR } from "@/features/activities/agendaScroll";
import { HOUR_HEIGHT_PX } from "@/features/activities/weekAgenda";
import { WeekAgendaGrid } from "./WeekAgendaGrid";

const dayIsos = [
  "2026-07-13",
  "2026-07-14",
  "2026-07-15",
  "2026-07-16",
  "2026-07-17",
  "2026-07-18",
  "2026-07-19",
];

function mk(id: string, dueIso: string): CalendarActivity {
  return {
    id,
    subject: `Call ${id}`,
    dueAt: new Date(dueIso),
    allDay: false,
    durationMinutes: 60,
    typeKey: "call",
    done: false,
    dealId: null,
    personId: null,
    orgId: null,
    overdue: false,
    ownerName: null,
  };
}

function scroller(): HTMLElement {
  const el = document.querySelector("[data-agenda-scroll]");
  if (el === null) throw new Error("no agenda scroll container");
  return el as HTMLElement;
}

describe("WeekAgendaGrid scroll position", () => {
  it("keeps the pinned rows inside the same scroll box as the hours", () => {
    // Split across two scroll boxes, the scrolling half loses the scrollbar's width wherever
    // scrollbars are not overlays, and the shared gridTemplateColumns then resolves against two
    // different widths: the day columns stop lining up with their own headings.
    const offsite = { ...mk("a2", "2026-07-15T12:00:00.000Z"), allDay: true };
    render(<WeekAgendaGrid dayIsos={dayIsos} activities={[offsite]} />);
    const box = scroller();
    expect(box.querySelector("[data-all-day-lane]")).not.toBeNull();
    expect(box.contains(screen.getByRole("group", { name: "Wednesday 15 July 2026" }))).toBe(true);
  });

  it("opens the hour grid on the working day rather than at midnight", () => {
    render(<WeekAgendaGrid dayIsos={dayIsos} activities={[]} />);
    expect(scroller().scrollTop).toBe(DEFAULT_START_HOUR * HOUR_HEIGHT_PX);
  });

  it("leaves the viewer's scroll position alone when the data refreshes", () => {
    // Saving an activity calls router.refresh(), which hands down a new activities array. Treating
    // that as a fresh mount yanked the viewer back to the top, away from the slot they just used.
    const { rerender } = render(<WeekAgendaGrid dayIsos={dayIsos} activities={[]} />);
    scroller().scrollTop = 900;
    rerender(<WeekAgendaGrid dayIsos={dayIsos} activities={[]} />);
    expect(scroller().scrollTop).toBe(900);
  });

  it("re-anchors when the viewer pages to another week", () => {
    const { rerender } = render(<WeekAgendaGrid dayIsos={dayIsos} activities={[]} />);
    scroller().scrollTop = 900;
    const nextWeek = dayIsos.map((iso) => iso.replace(/\d\d$/, (d) => String(Number(d) + 7)));
    rerender(<WeekAgendaGrid dayIsos={nextWeek} activities={[]} />);
    expect(scroller().scrollTop).toBe(DEFAULT_START_HOUR * HOUR_HEIGHT_PX);
  });

  it("ignores an activity outside the displayed week when choosing where to open", () => {
    // calendarRange pads the fetched range by a day either side and groupByLocalDay drops those
    // rows from every column, so one at 02:00 must not pull the view up to an empty 02:00.
    const padding = {
      ...mk("pad", "2026-07-15T09:00:00.000Z"),
      dueAt: new Date(2026, 6, 10, 2, 0),
    };
    render(<WeekAgendaGrid dayIsos={dayIsos} activities={[padding]} />);
    expect(scroller().scrollTop).toBe(DEFAULT_START_HOUR * HOUR_HEIGHT_PX);
  });

  it("opens earlier when a rendered activity would otherwise sit above the fold", () => {
    const early = {
      ...mk("early", "2026-07-15T09:00:00.000Z"),
      dueAt: new Date(2026, 6, 15, 6, 0),
    };
    render(<WeekAgendaGrid dayIsos={dayIsos} activities={[early]} />);
    expect(scroller().scrollTop).toBe(6 * HOUR_HEIGHT_PX);
  });
});

describe("WeekAgendaGrid", () => {
  it("places a timed activity as a chip in its day column", () => {
    render(
      <WeekAgendaGrid dayIsos={dayIsos} activities={[mk("a1", "2026-07-15T09:30:00.000Z")]} />,
    );
    expect(screen.getByText("Call a1")).toBeInTheDocument();
  });

  it("opens the deal drawer from a calendar chip, the same thing the Activities list opens", () => {
    // The list routes a row to its record; a chip for the same activity must not open a different
    // thing (an edit modal) just because the user is looking at the calendar.
    const onDeal = {
      ...mk("a1", "2026-07-15T09:30:00.000Z"),
      dealId: "d1",
      dealTitle: "Acme renewal",
    };
    render(<WeekAgendaGrid dayIsos={dayIsos} activities={[onDeal]} />);
    fireEvent.click(screen.getByRole("button", { name: /Call a1/ }));
    expect(push).toHaveBeenCalledWith("/deals/d1");
    expect(screen.queryByTestId("edit-modal")).toBeNull();
  });

  it("falls back to the edit modal for an activity that hangs off no record at all", () => {
    render(
      <WeekAgendaGrid dayIsos={dayIsos} activities={[mk("a1", "2026-07-15T09:30:00.000Z")]} />,
    );
    expect(screen.queryByTestId("edit-modal")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Call a1/ }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByTestId("edit-modal-id")).toHaveTextContent("a1");
    fireEvent.click(screen.getByRole("button", { name: "Close edit" }));
    expect(screen.queryByTestId("edit-modal")).toBeNull();
  });

  it("carries the chip's assignee so the edit modal shows that user's day load", () => {
    const assigned = { ...mk("a1", "2026-07-15T09:30:00.000Z"), assigneeId: "u2" };
    render(<WeekAgendaGrid dayIsos={dayIsos} activities={[assigned]} />);
    fireEvent.click(screen.getByRole("button", { name: "Call a1" }));
    expect(screen.getByTestId("edit-modal-assignee")).toHaveTextContent("u2");
  });

  it("gives every column the same all-day lane height, so an hour stays level across the week", () => {
    const offsite = { ...mk("a2", "2026-07-15T12:00:00.000Z"), allDay: true };
    const other = { ...mk("a3", "2026-07-15T12:00:00.000Z"), allDay: true };
    render(<WeekAgendaGrid dayIsos={dayIsos} activities={[offsite, other]} />);
    const lanes = Array.from(document.querySelectorAll("[data-all-day-lane]"));
    expect(lanes).toHaveLength(dayIsos.length);
    expect(new Set(lanes.map((l) => (l as HTMLElement).style.height)).size).toBe(1);
  });

  it("opens an all-day activity as all-day, not as a midnight appointment", () => {
    // The editor reads allDay to decide whether to show a start time; passing false would echo the
    // stored midnight back at the user as a real 00:00 start.
    const offsite = {
      ...mk("a2", "2026-07-15T00:00:00.000Z"),
      allDay: true,
      durationMinutes: null,
    };
    render(<WeekAgendaGrid dayIsos={dayIsos} activities={[offsite]} />);
    fireEvent.click(screen.getByRole("button", { name: /Call a2/ }));
    expect(screen.getByTestId("edit-modal-allday")).toHaveTextContent("true");
  });

  it("clicking an empty hour lane opens the add modal prefilled with that day + hour", () => {
    render(<WeekAgendaGrid dayIsos={dayIsos} activities={[]} />);
    expect(screen.queryByTestId("add-modal")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add activity on 2026-07-15 at 14:00" }));
    expect(screen.getByTestId("add-modal")).toBeInTheDocument();
    expect(screen.getByTestId("add-modal-date")).toHaveTextContent("2026-07-15");
    expect(screen.getByTestId("add-modal-time")).toHaveTextContent("14:00");
    fireEvent.click(screen.getByRole("button", { name: "Close add" }));
    expect(screen.queryByTestId("add-modal")).toBeNull();
  });
});
