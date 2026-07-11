// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const useQuery = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: { contacts: { personOptions: { useQuery: (...a: unknown[]) => useQuery(...a) } } },
}));
vi.mock("@/features/compose/ComposeNoteTab", () => ({
  ComposeNoteTab: () => <div data-testid="compose-note-tab" />,
}));

import { GlobalNoteModal } from "./GlobalNoteModal";

describe("GlobalNoteModal", () => {
  it("shows a person target picker and hides the note composer until a target is chosen", () => {
    useQuery.mockReturnValue({ data: [{ id: "p1", name: "Ada" }] });
    render(<GlobalNoteModal onClose={vi.fn()} onCreated={vi.fn()} />);
    // Dialog + target picker present.
    expect(screen.getByRole("dialog", { name: /New note/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Note target person")).toBeInTheDocument();
    // No target selected yet, so the note composer is not mounted.
    expect(screen.queryByTestId("compose-note-tab")).not.toBeInTheDocument();
  });
});
