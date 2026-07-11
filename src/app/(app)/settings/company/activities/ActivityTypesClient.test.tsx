// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const { createActivityTypeAction, deleteActivityTypeAction, setActivityTypeActiveAction } =
  vi.hoisted(() => ({
    createActivityTypeAction: vi.fn(() => Promise.resolve({ ok: true as const })),
    deleteActivityTypeAction: vi.fn(() =>
      Promise.resolve({ ok: false as const, error: { id: "E_ACTIVITY_003" } }),
    ),
    setActivityTypeActiveAction: vi.fn(() => Promise.resolve({ ok: true as const })),
  }));
vi.mock("@/features/activities/typeActions", () => ({
  createActivityTypeAction,
  deleteActivityTypeAction,
  renameActivityTypeAction: vi.fn(() => Promise.resolve({ ok: true as const })),
  reorderActivityTypesAction: vi.fn(() => Promise.resolve({ ok: true as const })),
  setActivityTypeActiveAction,
}));

import { ActivityTypesClient } from "./ActivityTypesClient";

const ROWS = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    key: "call",
    name: "Call",
    icon: null,
    isSystem: true,
    active: true,
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    key: "demo",
    name: "Demo",
    icon: "meeting",
    isSystem: false,
    active: true,
  },
];

describe("ActivityTypesClient", () => {
  it("lists activity types and hides delete on system rows", () => {
    render(<ActivityTypesClient rows={ROWS} />);
    expect(screen.getByText("Call")).toBeInTheDocument();
    expect(screen.getByText("Demo")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    // Only the non-system row exposes a Delete button.
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(1);
  });

  it("submits the add form via createActivityTypeAction", async () => {
    render(<ActivityTypesClient rows={ROWS} />);
    fireEvent.change(screen.getByLabelText("Activity type name"), {
      target: { value: "Lunch meeting" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add activity type" }));
    await waitFor(() =>
      expect(createActivityTypeAction).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Lunch meeting", key: "lunch_meeting" }),
        "csrf",
      ),
    );
  });

  it("shows the guarded-delete message when the action is blocked", async () => {
    render(<ActivityTypesClient rows={ROWS} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteActivityTypeAction).toHaveBeenCalled());
    expect(await screen.findByText(/Can't delete/)).toBeInTheDocument();
  });

  it("renders an enabled/disabled switch per activity type", () => {
    const { getAllByRole } = render(<ActivityTypesClient rows={ROWS} />);
    const switches = getAllByRole("switch");
    expect(switches).toHaveLength(2);
    expect(switches[0]).toBeChecked();
  });

  it("toggles a row's active state via the switch", async () => {
    render(<ActivityTypesClient rows={ROWS} />);
    fireEvent.click(screen.getAllByRole("switch")[0]!);
    await waitFor(() =>
      expect(setActivityTypeActiveAction).toHaveBeenCalledWith(
        { id: ROWS[0]!.id, active: false },
        "csrf",
      ),
    );
  });

  // ACTIVITIES-17: after add/rename/toggle/delete the handler calls router.refresh(), which re-runs
  // the server component with fresh props. The list must re-seed from those props without a reload.
  it("re-seeds the list when refreshed props arrive (add)", () => {
    const { rerender } = render(<ActivityTypesClient rows={ROWS} />);
    rerender(
      <ActivityTypesClient
        rows={[
          ...ROWS,
          {
            id: "33333333-3333-3333-3333-333333333333",
            key: "lunch",
            name: "Lunch",
            icon: "meeting",
            isSystem: false,
            active: true,
          },
        ]}
      />,
    );
    expect(screen.getByText("Lunch")).toBeInTheDocument();
  });

  it("reflects a toggled active state delivered via refreshed props", () => {
    const { rerender } = render(<ActivityTypesClient rows={ROWS} />);
    expect(screen.getAllByRole("switch")[0]).toBeChecked();
    rerender(<ActivityTypesClient rows={[{ ...ROWS[0]!, active: false }, ROWS[1]!]} />);
    expect(screen.getAllByRole("switch")[0]).not.toBeChecked();
  });
});
