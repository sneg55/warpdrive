// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LABEL_COLORS, type LabelTarget } from "@/constants/labelColors";
import { STRINGS } from "@/constants/strings";

type ResultLike = { ok: true; value: unknown } | { ok: false; error: { id: string } };

const { reorderLabelsAction, createLabelAction } = vi.hoisted(() => ({
  reorderLabelsAction: vi.fn((): Promise<ResultLike> => Promise.resolve({ ok: true, value: {} })),
  createLabelAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "new" } })),
}));
vi.mock("@/features/labels/actions", () => ({
  reorderLabelsAction,
  createLabelAction,
  deleteLabelAction: vi.fn(() => Promise.resolve({ ok: true, value: {} })),
  renameLabelAction: vi.fn(() => Promise.resolve({ ok: true, value: {} })),
  setLabelColorAction: vi.fn(() => Promise.resolve({ ok: true, value: {} })),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const report = vi.fn();
vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => report }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

import { LabelsClient } from "./LabelsClient";

const color = LABEL_COLORS[0];
function row(id: string, name: string, target: LabelTarget = "deal") {
  return { id, name, color, target };
}
// Only the label rows carry a name; the per-group add-row <li> holds an input, not the text.
function namedRows(...names: string[]): (HTMLElement | undefined)[] {
  const re = new RegExp(names.join("|"));
  return screen.getAllByRole("listitem").filter((li) => re.test(li.textContent ?? ""));
}

describe("LabelsClient", () => {
  it("uses the same color picker geometry for label rows and add-label forms", () => {
    render(<LabelsClient rows={[row("l1", "Hot")]} />);

    const rowPicker = screen.getByRole("combobox", { name: STRINGS.settings.color });
    const addPicker = screen.getByRole("combobox", { name: "Deals Color" });
    expect(rowPicker.className).toBe(addPicker.className);
    expect(rowPicker.parentElement).toHaveClass("w-32");
    expect(addPicker.parentElement).toHaveClass("w-32");
  });

  it("renders each group's add-label row inside that group's bordered box", () => {
    render(<LabelsClient rows={[row("l1", "Hot")]} />);
    const addButton = screen.getAllByRole("button", { name: /add label/i })[0];
    if (addButton === undefined) throw new Error("no add-label button");
    // The add-row must live in the same bordered <ul> as the group's label rows, not below it.
    const box = addButton.closest("ul");
    expect(box).not.toBeNull();
    expect(within(box as HTMLElement).getAllByText("Hot").length).toBeGreaterThan(0);
  });

  it("creates a label via createLabelAction when Add label is clicked", async () => {
    render(<LabelsClient rows={[row("l1", "Hot")]} />);
    fireEvent.change(screen.getByLabelText("Deals Label name"), {
      target: { value: "Enterprise" },
    });
    const addButton = screen.getAllByRole("button", { name: /add label/i })[0];
    if (addButton === undefined) throw new Error("no add-label button");
    fireEvent.click(addButton);
    await vi.waitFor(() =>
      expect(createLabelAction).toHaveBeenCalledWith(
        expect.objectContaining({ target: "deal", name: "Enterprise" }),
        "csrf",
      ),
    );
  });

  // SETTINGS-08 sibling (LabelsClient lacked the re-seed effect its siblings have): after a
  // router.refresh() the server component re-runs with fresh rows; without re-seeding, a failed
  // reorder's optimistic order stays stuck until a hard reload.
  it("re-seeds the label order when refreshed props arrive", () => {
    const { rerender } = render(<LabelsClient rows={[row("a", "Alpha"), row("b", "Beta")]} />);
    const before = namedRows("Alpha", "Beta").map((li) => li?.textContent);
    expect(before[0]).toContain("Alpha");
    expect(before[1]).toContain("Beta");

    // Refreshed props deliver the opposite order (server truth): the list must reflect it.
    rerender(<LabelsClient rows={[row("b", "Beta"), row("a", "Alpha")]} />);
    const after = namedRows("Alpha", "Beta").map((li) => li?.textContent);
    expect(after[0]).toContain("Beta");
    expect(after[1]).toContain("Alpha");
  });

  it("surfaces a failed reorder via the shared action-error reporter", async () => {
    reorderLabelsAction.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } });
    render(<LabelsClient rows={[row("a", "Alpha"), row("b", "Beta")]} />);

    const firstRow = namedRows("Alpha")[0];
    if (firstRow === undefined) throw new Error("no Alpha row");
    fireEvent.click(within(firstRow).getByRole("button", { name: STRINGS.settings.moveDown }));

    await vi.waitFor(() => expect(reorderLabelsAction).toHaveBeenCalled());
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith("E_PERM_001"));
  });

  it("does not report on a successful reorder", async () => {
    render(<LabelsClient rows={[row("a", "Alpha"), row("b", "Beta")]} />);
    const firstRow = namedRows("Alpha")[0];
    if (firstRow === undefined) throw new Error("no Alpha row");
    fireEvent.click(within(firstRow).getByRole("button", { name: STRINGS.settings.moveDown }));

    await vi.waitFor(() => expect(reorderLabelsAction).toHaveBeenCalled());
    expect(report).not.toHaveBeenCalled();
  });
});
