// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mergePersonsAction = vi.fn();
const mergeOrgsAction = vi.fn();
vi.mock("./actions", () => ({
  mergePersonsAction: (...a: unknown[]) => mergePersonsAction(...a),
  mergeOrgsAction: (...a: unknown[]) => mergeOrgsAction(...a),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { BulkMergeDialog } from "./BulkMergeDialog";

afterEach(() => {
  cleanup();
  mergePersonsAction.mockReset();
  mergeOrgsAction.mockReset();
});

const RECORDS: [{ id: string; name: string }, { id: string; name: string }] = [
  { id: "p1", name: "Jane Roe" },
  { id: "p2", name: "Jane R." },
];

describe("BulkMergeDialog", () => {
  it("merges the two records, keeping the chosen survivor and merging the other away", async () => {
    mergePersonsAction.mockResolvedValue({ ok: true, value: { id: "p1" } });
    const onMerged = vi.fn();
    render(
      <BulkMergeDialog kind="person" records={RECORDS} onMerged={onMerged} onClose={vi.fn()} />,
    );

    // Survivor defaults to the first record; confirm merges the second into it.
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));

    await waitFor(() =>
      expect(mergePersonsAction).toHaveBeenCalledWith(
        { survivorId: "p1", mergedId: "p2", fieldChoices: {} },
        "csrf",
      ),
    );
    await waitFor(() => expect(onMerged).toHaveBeenCalledWith("p1"));
  });

  it("surfaces a merge failure without calling onMerged", async () => {
    mergePersonsAction.mockResolvedValue({ ok: false, error: { id: "E_PERM_001" } });
    const onMerged = vi.fn();
    render(
      <BulkMergeDialog kind="person" records={RECORDS} onMerged={onMerged} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));

    await screen.findByText(/could not merge/i);
    expect(onMerged).not.toHaveBeenCalled();
  });
});
