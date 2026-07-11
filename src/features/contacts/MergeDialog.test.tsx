// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Radix Select (branded dropdown) needs these jsdom polyfills.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    contacts: {
      orgOptions: {
        useQuery: () => ({
          data: [
            { id: "o1", name: "Acme" },
            { id: "o2", name: "Globex" },
          ],
        }),
      },
      personOptions: {
        useQuery: () => ({
          data: [
            { id: "p1", name: "Jane Roe" },
            { id: "p2", name: "John Doe" },
          ],
        }),
      },
    },
  },
}));

const { mergeOrgsAction, mergePersonsAction } = vi.hoisted(() => ({
  mergeOrgsAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "o1" } })),
  mergePersonsAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "p1" } })),
}));
vi.mock("./actions", () => ({ mergeOrgsAction, mergePersonsAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "tok" }));

import { MergeDialog } from "./MergeDialog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Both selects are now the branded Select (Radix): open the trigger by aria-label,
// then click the option by its role (not text, since a picked value's label can also
// appear as plain text in an already-selected trigger elsewhere on the page).
function pick(labelText: string, optionText: string): void {
  fireEvent.click(screen.getByLabelText(labelText));
  fireEvent.click(screen.getByRole("option", { name: optionText }));
}

describe("MergeDialog", () => {
  it("disables confirm until both a partner and a survivor are chosen", () => {
    render(<MergeDialog kind="org" current={{ id: "o1", name: "Acme" }} onMerged={() => {}} />);
    const confirm = screen.getByRole("button", { name: "Merge" });
    expect(confirm).toBeDisabled();
    pick("Merge with", "Globex");
    pick("Survivor", "Acme");
    expect(confirm).toBeEnabled();
  });

  it("calls mergeOrgsAction with the chosen survivor and merged-away ids", async () => {
    const onMerged = vi.fn();
    render(<MergeDialog kind="org" current={{ id: "o1", name: "Acme" }} onMerged={onMerged} />);
    pick("Merge with", "Globex");
    pick("Survivor", "Acme");
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await vi.waitFor(() =>
      expect(mergeOrgsAction).toHaveBeenCalledWith(
        expect.objectContaining({ survivorId: "o1", mergedId: "o2" }),
        "tok",
      ),
    );
    // onMerged must receive the survivor id so the caller can navigate to it (the
    // current record is the survivor here, so it stays put).
    await vi.waitFor(() => expect(onMerged).toHaveBeenCalledWith("o1"));
  });

  it("calls mergePersonsAction for kind=person and reports the survivor id", async () => {
    const onMerged = vi.fn();
    render(
      <MergeDialog kind="person" current={{ id: "p1", name: "Jane Roe" }} onMerged={onMerged} />,
    );
    pick("Merge with", "John Doe");
    pick("Survivor", "John Doe");
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await vi.waitFor(() =>
      expect(mergePersonsAction).toHaveBeenCalledWith(
        expect.objectContaining({ survivorId: "p2", mergedId: "p1" }),
        "tok",
      ),
    );
    // The current record (p1) was merged away, so the caller must be told to go to p2.
    await vi.waitFor(() => expect(onMerged).toHaveBeenCalledWith("p2"));
  });
});
