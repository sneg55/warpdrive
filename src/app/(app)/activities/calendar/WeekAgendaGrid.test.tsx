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

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

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
  ActivityEditModal: ({ activity, onClose }: { activity: { id: string }; onClose: () => void }) => (
    <div data-testid="edit-modal">
      <span data-testid="edit-modal-id">{activity.id}</span>
      <button type="button" onClick={onClose}>
        Close edit
      </button>
    </div>
  ),
}));

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

describe("WeekAgendaGrid", () => {
  it("places a timed activity as a chip in its day column", () => {
    render(
      <WeekAgendaGrid dayIsos={dayIsos} activities={[mk("a1", "2026-07-15T09:30:00.000Z")]} />,
    );
    expect(screen.getByText("Call a1")).toBeInTheDocument();
  });

  it("clicking an activity chip opens the edit modal for that activity", () => {
    render(
      <WeekAgendaGrid dayIsos={dayIsos} activities={[mk("a1", "2026-07-15T09:30:00.000Z")]} />,
    );
    expect(screen.queryByTestId("edit-modal")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Call a1" }));
    expect(screen.getByTestId("edit-modal-id")).toHaveTextContent("a1");
    fireEvent.click(screen.getByRole("button", { name: "Close edit" }));
    expect(screen.queryByTestId("edit-modal")).toBeNull();
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
