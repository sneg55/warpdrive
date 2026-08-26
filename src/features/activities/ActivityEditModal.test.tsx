// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const { dayLoadQuery, invalidateDayLoad } = vi.hoisted(() => ({
  dayLoadQuery: vi.fn<(input: { userId: string | null }) => { data: undefined }>(() => ({
    data: undefined,
  })),
  invalidateDayLoad: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    activities: {
      listTypes: {
        useQuery: () => ({ data: [{ id: "t1", key: "call", name: "Call" }] }),
      },
      dayLoad: { useQuery: dayLoadQuery },
    },
    useUtils: () => ({ activities: { dayLoad: { invalidate: invalidateDayLoad } } }),
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
  allDay: false,
  durationMinutes: 30,
  location: null,
  done: false,
};

function holdInvalidation(): { settle: () => Promise<void> } {
  let resolveInvalidation = (): void => {};
  const held = new Promise<void>((resolve) => {
    resolveInvalidation = () => {
      resolve();
    };
  });
  invalidateDayLoad.mockImplementationOnce(() => held);
  return {
    settle: async () => {
      resolveInvalidation();
      await held;
    },
  };
}

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

  it("shows the assignee's day load, not the signed-in user's", () => {
    render(
      <ActivityEditModal
        activity={{ ...activity, assigneeId: "u2" }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(dayLoadQuery.mock.calls.map((c) => c[0].userId)).toContain("u2");
  });

  it("invalidates the day load after a successful save", async () => {
    render(<ActivityEditModal activity={activity} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(invalidateDayLoad).toHaveBeenCalled());
  });

  it("invalidates the day load after a successful delete", async () => {
    render(<ActivityEditModal activity={activity} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(invalidateDayLoad).toHaveBeenCalled());
  });

  it("invalidates the day load after marking the activity done", async () => {
    render(<ActivityEditModal activity={activity} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark as done" }));
    await waitFor(() => expect(invalidateDayLoad).toHaveBeenCalled());
  });

  it("ignores a second Save click while the day load is still invalidating", async () => {
    const invalidation = holdInvalidation();
    render(<ActivityEditModal activity={activity} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Renamed" } });
    const save = screen.getByRole("button", { name: "Save" });
    fireEvent.click(save);
    await waitFor(() => expect(invalidateDayLoad).toHaveBeenCalled());
    fireEvent.click(save);
    await act(async () => {
      await invalidation.settle();
    });
    expect(editActivityAction).toHaveBeenCalledTimes(1);
  });

  it("ignores a second Delete click while the day load is still invalidating", async () => {
    const invalidation = holdInvalidation();
    render(<ActivityEditModal activity={activity} onClose={vi.fn()} onSaved={vi.fn()} />);
    const remove = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(remove);
    await waitFor(() => expect(invalidateDayLoad).toHaveBeenCalled());
    fireEvent.click(remove);
    await act(async () => {
      await invalidation.settle();
    });
    expect(deleteActivityAction).toHaveBeenCalledTimes(1);
  });

  it("ignores a second Mark as done click while the day load is still invalidating", async () => {
    const invalidation = holdInvalidation();
    render(<ActivityEditModal activity={activity} onClose={vi.fn()} onSaved={vi.fn()} />);
    const done = screen.getByRole("button", { name: "Mark as done" });
    fireEvent.click(done);
    await waitFor(() => expect(invalidateDayLoad).toHaveBeenCalled());
    fireEvent.click(done);
    await act(async () => {
      await invalidation.settle();
    });
    expect(completeActivityAction).toHaveBeenCalledTimes(1);
  });

  it("does not invalidate the day load when the save fails", async () => {
    editActivityAction.mockResolvedValueOnce({
      ok: false,
      error: { id: "E_ACTIVITY_006" },
    } as never);
    render(<ActivityEditModal activity={activity} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(invalidateDayLoad).not.toHaveBeenCalled();
  });
});
