// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const createSavedFilterAction = vi.fn();
vi.mock("@/features/saved-filters/serverActions", () => ({
  createSavedFilterAction: (...args: unknown[]) => createSavedFilterAction(...args),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { CreateFilterModal } from "./CreateFilterModal";

afterEach(() => {
  cleanup();
  createSavedFilterAction.mockReset();
});

describe("CreateFilterModal", () => {
  it("renders a Create new filter dialog with one condition row", () => {
    render(<CreateFilterModal onClose={() => {}} onSave={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Create new filter" })).not.toBeNull();
    expect(screen.getAllByLabelText("Field")).toHaveLength(1);
  });

  it("adds a condition row", () => {
    render(<CreateFilterModal onClose={() => {}} onSave={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Add condition" }));
    expect(screen.getAllByLabelText("Field")).toHaveLength(2);
  });

  it("saves via the server action and reports the AST definition, dropping empty rows", async () => {
    createSavedFilterAction.mockResolvedValue({ ok: true, value: { id: "srv-1" } });
    const onSave = vi.fn();
    render(<CreateFilterModal onClose={() => {}} onSave={onSave} />);
    // Add a second row and leave it empty so it is dropped.
    fireEvent.click(screen.getByRole("button", { name: "Add condition" }));
    fireEvent.change(screen.getByLabelText("Filter name"), { target: { value: "Big deals" } });
    fireEvent.change(screen.getAllByLabelText("Value")[0]!, { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0]![0] as {
      id: string;
      name: string;
      definition: { conditions: Array<{ field: string; op: string; value: string }> };
    };
    expect(saved.id).toBe("srv-1");
    expect(saved.name).toBe("Big deals");
    expect(saved.definition.conditions).toEqual([
      { field: "title", op: "contains", value: "Acme" },
    ]);

    // The server action received the same definition + a shared flag.
    const [input] = createSavedFilterAction.mock.calls[0]!;
    expect((input as { definition: { conditions: unknown[] } }).definition.conditions).toHaveLength(
      1,
    );
    expect((input as { isShared: boolean }).isShared).toBe(false);
  });

  it("shows an error when the server action fails", async () => {
    createSavedFilterAction.mockResolvedValue({ ok: false, error: { id: "E_DEAL_001" } });
    const onSave = vi.fn();
    render(<CreateFilterModal onClose={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getAllByLabelText("Value")[0]!, { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText(/Could not save/)).not.toBeNull());
    expect(onSave).not.toHaveBeenCalled();
  });

  it("closes via the X button", () => {
    const onClose = vi.fn();
    render(<CreateFilterModal onClose={onClose} onSave={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("auto-populates the filter name from the conditions until the user edits it", () => {
    render(<CreateFilterModal onClose={() => {}} onSave={() => {}} />);
    fireEvent.change(screen.getAllByLabelText("Value")[0]!, { target: { value: "Acme" } });
    const nameInput = screen.getByLabelText<HTMLInputElement>("Filter name");
    expect(nameInput.value).toBe("Title contains Acme");
    // Once the user types their own name, auto-population stops overwriting it.
    fireEvent.change(nameInput, { target: { value: "My filter" } });
    fireEvent.change(screen.getAllByLabelText("Value")[0]!, { target: { value: "Acme Corp" } });
    expect(nameInput.value).toBe("My filter");
  });

  it("previews the in-progress definition without saving it", () => {
    const onPreview = vi.fn();
    render(<CreateFilterModal onClose={() => {}} onSave={() => {}} onPreview={onPreview} />);
    fireEvent.change(screen.getAllByLabelText("Value")[0]!, { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview.mock.calls[0]![0]).toEqual({
      conditions: [{ field: "title", op: "contains", value: "Acme" }],
    });
    // Preview must not persist anything.
    expect(createSavedFilterAction).not.toHaveBeenCalled();
  });

  it("applies the in-progress definition ad-hoc (Apply) without saving, then closes", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<CreateFilterModal onClose={onClose} onSave={() => {}} onApply={onApply} />);
    fireEvent.change(screen.getAllByLabelText("Value")[0]!, { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]![0]).toEqual({
      conditions: [{ field: "title", op: "contains", value: "Acme" }],
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    // Apply is ad-hoc: it must not persist a saved filter.
    expect(createSavedFilterAction).not.toHaveBeenCalled();
  });
});
