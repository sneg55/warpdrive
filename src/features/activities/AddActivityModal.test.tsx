// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    activities: {
      listTypes: {
        useQuery: () => ({
          data: [
            { id: "t1", key: "call", name: "Call" },
            { id: "t2", key: "meeting", name: "Meeting" },
          ],
        }),
      },
    },
    contacts: {
      listPeople: { useQuery: () => ({ data: { rows: [], total: 0 } }) },
      listOrgs: { useQuery: () => ({ data: { rows: [], total: 0 } }) },
    },
  },
}));

const { createActivityAction } = vi.hoisted(() => ({
  createActivityAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "a1" } })),
}));
vi.mock("./actions", () => ({ createActivityAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { AddActivityModal } from "./AddActivityModal";

describe("AddActivityModal", () => {
  it("renders the composer type rail plus subject/priority/due fields", () => {
    render(<AddActivityModal onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Add activity" })).toBeInTheDocument();
    // Type is the deal-composer TypeIconRail: one labelled button per type, not a Select.
    expect(screen.getByRole("button", { name: "Call" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Meeting" })).toBeInTheDocument();
    expect(screen.getByLabelText("Subject")).toBeInTheDocument();
    expect(screen.getByLabelText("Priority")).toBeInTheDocument();
    expect(screen.getByLabelText("Due date")).toBeInTheDocument();
  });

  it("selects a type from the icon rail and submits that typeId", async () => {
    render(<AddActivityModal onClose={vi.fn()} onCreated={vi.fn()} dealId="d1" />);
    // Default (first) type is pressed until the user picks another.
    const meeting = screen.getByRole("button", { name: "Meeting" });
    expect(meeting).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(meeting);
    expect(meeting).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Follow up" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(createActivityAction).toHaveBeenCalledWith(
        expect.objectContaining({ typeId: "t2" }),
        expect.anything(),
      ),
    );
  });

  it("submits with the default type and entered subject", async () => {
    const onCreated = vi.fn();
    render(<AddActivityModal onClose={vi.fn()} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Follow up" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(createActivityAction).toHaveBeenCalledWith(
        expect.objectContaining({ typeId: "t1", subject: "Follow up" }),
        expect.anything(),
      ),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("submits with the leadId and dueAt when a date is provided (lead workspace composer)", async () => {
    render(<AddActivityModal onClose={vi.fn()} onCreated={vi.fn()} leadId="lead-1" />);
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Log a call" } });
    fireEvent.click(screen.getByLabelText("Due date"));
    // findByText: the calendar is a next/dynamic chunk that loads on open.
    fireEvent.click(await screen.findByText("10"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(createActivityAction).toHaveBeenCalledWith(
        expect.objectContaining({
          leadId: "lead-1",
          subject: "Log a call",
          dueAt: expect.stringMatching(/-10T/),
        }),
        expect.anything(),
      ),
    );
  });

  it("blocks a lead activity with no due date (leadTimeline hides undated rows)", async () => {
    render(<AddActivityModal onClose={vi.fn()} onCreated={vi.fn()} leadId="lead-1" />);
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Log a call" } });
    // With a leadId and no date, Save is disabled: clicking it must not create the activity.
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(createActivityAction).not.toHaveBeenCalled();
    // Non-lead callers stay unblocked with no date (GlobalAddMenu, ActivitiesTable).
    cleanup();
    render(<AddActivityModal onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "No date ok" } });
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("blocks an empty subject with an inline error", async () => {
    render(<AddActivityModal onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/subject/i);
    expect(createActivityAction).not.toHaveBeenCalled();
  });

  it("seeds the DatePicker + TimePicker from defaultDate/defaultTime (calendar click-to-create)", () => {
    // WeekAgendaGrid's own test mocks AddActivityModal out entirely (it only asserts the props
    // it passes down), so this is the only place the prop -> useState -> rendered-picker wiring
    // is actually exercised end to end.
    render(
      <AddActivityModal
        onClose={vi.fn()}
        onCreated={vi.fn()}
        defaultDate="2026-07-15"
        defaultTime="14:00"
      />,
    );
    expect(screen.getByLabelText("Due date")).toHaveTextContent("07/15/2026");
    expect(screen.getByLabelText("Start time")).toHaveValue("14:00");
  });

  it("sends the chosen time of day, not a hardcoded 09:00", async () => {
    render(<AddActivityModal onClose={vi.fn()} onCreated={vi.fn()} dealId="d1" />);
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Call Ann" } });
    fireEvent.click(screen.getByLabelText("Due date"));
    fireEvent.click(screen.getByText("15"));
    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "14:30" } });
    fireEvent.blur(screen.getByLabelText("Start time"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(createActivityAction).toHaveBeenCalled());
    const [payload] = createActivityAction.mock.calls[0] as unknown as [
      Record<string, unknown>,
      string,
    ];
    expect(new Date(payload.dueAt as string).getHours()).toBe(14);
    expect(new Date(payload.dueAt as string).getMinutes()).toBe(30);
  });
});
