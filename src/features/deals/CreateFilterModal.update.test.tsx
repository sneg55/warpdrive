// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import type { SavedFilterView } from "./savedFilterView";

const createSavedFilterAction = vi.fn();
const updateSavedFilterAction = vi.fn();
vi.mock("@/features/saved-filters/serverActions", () => ({
  createSavedFilterAction: (...args: unknown[]) => createSavedFilterAction(...args),
  updateSavedFilterAction: (...args: unknown[]) => updateSavedFilterAction(...args),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    labels: {
      listByTarget: { useQuery: () => ({ data: [] }) },
      appliedNames: { useQuery: () => ({ data: [] }) },
    },
  },
}));

import { CreateFilterModal } from "./CreateFilterModal";

afterEach(() => {
  cleanup();
  createSavedFilterAction.mockReset();
  updateSavedFilterAction.mockReset();
});

const DEFINITION: FilterDefinition = {
  combinator: "or",
  conditions: [
    { field: "title", op: "contains", value: "Acme" },
    { field: "title", op: "contains", value: "Corp" },
  ],
};

function view(overrides: Partial<SavedFilterView> = {}): SavedFilterView {
  return {
    id: "f1",
    name: "Acme or Corp",
    favorite: false,
    isShared: false,
    isOwn: true,
    definition: DEFINITION,
    ...overrides,
  };
}

describe("CreateFilterModal editing a saved filter", () => {
  it("updates the filter in place when the actor owns it", async () => {
    updateSavedFilterAction.mockResolvedValue({ ok: true, value: undefined });
    const onSave = vi.fn();
    render(<CreateFilterModal onClose={() => {}} onSave={onSave} savedFilter={view()} />);

    fireEvent.change(screen.getByLabelText("Condition 1 value"), { target: { value: "Globex" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateSavedFilterAction).toHaveBeenCalledTimes(1));
    expect(createSavedFilterAction).not.toHaveBeenCalled();
    const [id, patch, csrf] = updateSavedFilterAction.mock.calls[0]!;
    expect(id).toBe("f1");
    expect(csrf).toBe("csrf");
    expect(patch).toEqual({
      name: "Acme or Corp",
      isShared: false,
      definition: {
        combinator: "or",
        conditions: [
          { field: "title", op: "contains", value: "Globex" },
          { field: "title", op: "contains", value: "Corp" },
        ],
      },
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: "f1", name: "Acme or Corp" }),
    );
  });

  it("titles the dialog as an edit, not a create, for a filter the actor owns", () => {
    render(<CreateFilterModal onClose={() => {}} onSave={() => {}} savedFilter={view()} />);
    expect(screen.getByRole("dialog", { name: "Edit filter" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  // Update is owner-scoped server-side, so the dialog must not offer it on someone else's filter.
  it("forks someone else's shared filter and says so", async () => {
    createSavedFilterAction.mockResolvedValue({ ok: true, value: { id: "srv-9" } });
    const onSave = vi.fn();
    render(
      <CreateFilterModal
        onClose={() => {}}
        onSave={onSave}
        savedFilter={view({ isOwn: false, isShared: true })}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Save as a new filter" })).toBeInTheDocument();
    expect(screen.getByText(/you don't own this filter/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save as new" }));
    await waitFor(() => expect(createSavedFilterAction).toHaveBeenCalledTimes(1));
    expect(updateSavedFilterAction).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: "srv-9" }));
  });

  it("still creates when the dialog opens on no saved filter", async () => {
    createSavedFilterAction.mockResolvedValue({ ok: true, value: { id: "srv-1" } });
    render(<CreateFilterModal onClose={() => {}} onSave={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Create new filter" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Condition 1 value"), { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(createSavedFilterAction).toHaveBeenCalledTimes(1));
    expect(updateSavedFilterAction).not.toHaveBeenCalled();
  });

  // A rejected update has to read like the rejected create: human copy, never a bare error id.
  it("renders human copy when the update is rejected", async () => {
    updateSavedFilterAction.mockResolvedValue({ ok: false, error: { id: "E_DEAL_008" } });
    const onSave = vi.fn();
    render(<CreateFilterModal onClose={() => {}} onSave={onSave} savedFilter={view()} />);

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(screen.getByText("One of these conditions isn't valid")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/E_DEAL_008/)).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  // Saving an owned filter must not rename it to a description derived from its conditions.
  it("keeps the saved filter's own name in the name field", () => {
    render(<CreateFilterModal onClose={() => {}} onSave={() => {}} savedFilter={view()} />);
    expect(screen.getByLabelText<HTMLInputElement>("Filter name").value).toBe("Acme or Corp");
  });

  // Its shared flag is part of the row being updated, so it must round-trip, not reset to private.
  it("seeds the shared checkbox from the filter being edited", async () => {
    updateSavedFilterAction.mockResolvedValue({ ok: true, value: undefined });
    render(
      <CreateFilterModal
        onClose={() => {}}
        onSave={() => {}}
        savedFilter={view({ isShared: true })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateSavedFilterAction).toHaveBeenCalledTimes(1));
    expect(updateSavedFilterAction.mock.calls[0]![1]).toMatchObject({ isShared: true });
  });
});
