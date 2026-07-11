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
        useQuery: () => ({ data: [{ id: "t1", key: "call", name: "Call" }] }),
      },
    },
  },
}));

const { editActivityAction, deleteActivityAction, completeActivityAction } = vi.hoisted(() => ({
  editActivityAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "a1" } })),
  deleteActivityAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "a1" } })),
  completeActivityAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "a1" } })),
}));
vi.mock("./actions", () => ({ editActivityAction, deleteActivityAction, completeActivityAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { ActivityEditModal } from "./ActivityEditModal";

const activity = {
  id: "a1",
  subject: "Discovery",
  typeId: "t1",
  priority: null,
  dueAtIso: "2026-07-15T14:30:00.000Z",
  durationMinutes: 30,
  location: null,
  done: false,
};

describe("ActivityEditModal", () => {
  it("edits the subject and saves only the changed field", async () => {
    const onSaved = vi.fn();
    render(<ActivityEditModal activity={activity} onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(editActivityAction).toHaveBeenCalledWith({ id: "a1", subject: "Renamed" }, "csrf"),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("deletes the activity", async () => {
    const onSaved = vi.fn();
    render(<ActivityEditModal activity={activity} onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteActivityAction).toHaveBeenCalledWith({ id: "a1" }, "csrf"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("shows Reopen for a done activity and completes/reopens it", async () => {
    render(
      <ActivityEditModal
        activity={{ ...activity, done: true }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Reopen" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
    await waitFor(() =>
      expect(completeActivityAction).toHaveBeenCalledWith({ id: "a1", done: false }, "csrf"),
    );
  });

  it("shows an error and keeps the modal open when save fails", async () => {
    editActivityAction.mockResolvedValueOnce({
      ok: false,
      error: { id: "E_ACTIVITY_006" },
    } as never);
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<ActivityEditModal activity={activity} onClose={onClose} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("E_ACTIVITY_006"));
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows an error and keeps the modal open when delete fails", async () => {
    deleteActivityAction.mockResolvedValueOnce({
      ok: false,
      error: { id: "E_ACTIVITY_006" },
    } as never);
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<ActivityEditModal activity={activity} onClose={onClose} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("E_ACTIVITY_006"));
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
