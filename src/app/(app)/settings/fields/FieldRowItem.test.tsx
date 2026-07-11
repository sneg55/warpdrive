// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STRINGS } from "@/constants/strings";
import type { FieldRow } from "./types";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const report = vi.hoisted(() => vi.fn());
vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => report }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const S = STRINGS.settings;

const actions = vi.hoisted(() => ({
  archiveDefAction: vi.fn<() => Promise<MockActionResult<{ id: string }>>>(() =>
    Promise.resolve({ ok: true, value: { id: "d1" } }),
  ),
  renameDefAction: vi.fn<() => Promise<MockActionResult<{ id: string }>>>(() =>
    Promise.resolve({ ok: true, value: { id: "d1" } }),
  ),
  setDefFlagsAction: vi.fn<() => Promise<MockVoidActionResult>>(() =>
    Promise.resolve({ ok: true }),
  ),
}));
vi.mock("@/features/custom-fields/actions", () => actions);

import type { MockActionResult, MockVoidActionResult } from "@/test/actionResult";
import { FieldRowItem } from "./FieldRowItem";

const ROW: FieldRow = {
  id: "d1",
  name: "Budget",
  type: "monetary",
  options: [],
  isImportant: false,
  showInAddForm: false,
};

// FieldRowItem calls useSortable, which reads dnd-kit's React context, so it must render
// under the same DndContext/SortableContext nesting FieldList provides in production.
function renderRow(row: FieldRow): ReturnType<typeof render> {
  return render(
    <DndContext>
      <SortableContext items={[row.id]}>
        <ul>
          <FieldRowItem row={row} />
        </ul>
      </SortableContext>
    </DndContext>,
  );
}

describe("FieldRowItem placement toggles", () => {
  it("toggles Important via setDefFlagsAction, sending the full flag pair", async () => {
    renderRow(ROW);
    fireEvent.click(screen.getByRole("switch", { name: "Important" }));
    await waitFor(() =>
      expect(actions.setDefFlagsAction).toHaveBeenCalledWith(
        { id: "d1", isImportant: true, showInAddForm: false },
        "csrf",
      ),
    );
  });

  it("toggles Show in add form via setDefFlagsAction, sending the full flag pair", async () => {
    renderRow({ ...ROW, isImportant: true });
    fireEvent.click(screen.getByRole("switch", { name: "Show in add form" }));
    await waitFor(() =>
      expect(actions.setDefFlagsAction).toHaveBeenCalledWith(
        { id: "d1", isImportant: true, showInAddForm: true },
        "csrf",
      ),
    );
  });

  it("reflects the def's current flag state in the switches", () => {
    renderRow({ ...ROW, isImportant: true, showInAddForm: true });
    expect(screen.getByRole("switch", { name: "Important" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("switch", { name: "Show in add form" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

describe("FieldRowItem surfaces failed mutations", () => {
  it("reports the error id when archive is denied", async () => {
    actions.archiveDefAction.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } });
    renderRow(ROW);
    fireEvent.click(screen.getByRole("button", { name: S.archive }));
    await waitFor(() => expect(report).toHaveBeenCalledWith("E_PERM_001"));
  });

  it("reports the error id when a rename is denied", async () => {
    actions.renameDefAction.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } });
    renderRow(ROW);
    fireEvent.click(screen.getByRole("button", { name: S.rename }));
    fireEvent.change(screen.getByLabelText(S.rename), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: S.save }));
    await waitFor(() => expect(report).toHaveBeenCalledWith("E_PERM_001"));
  });

  it("reports the error id when a flag toggle is denied", async () => {
    actions.setDefFlagsAction.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } });
    renderRow(ROW);
    fireEvent.click(screen.getByRole("switch", { name: S.important }));
    await waitFor(() => expect(report).toHaveBeenCalledWith("E_PERM_001"));
  });
});
