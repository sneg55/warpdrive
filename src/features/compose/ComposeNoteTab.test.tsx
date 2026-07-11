// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { createNoteAction } = vi.hoisted(() => ({
  createNoteAction: vi.fn((...args: unknown[]) => {
    void args;
    return Promise.resolve({ ok: true as const, value: { id: "n1" } });
  }),
}));

vi.mock("@/features/collaboration/actions", () => ({ createNoteAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { ComposeNoteTab } from "./ComposeNoteTab";

describe("ComposeNoteTab", () => {
  it("does not submit an empty note", () => {
    render(<ComposeNoteTab entityType="deal" entityId="d1" onNoteCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(createNoteAction).not.toHaveBeenCalled();
  });

  it("does not submit a whitespace-only note", () => {
    render(<ComposeNoteTab entityType="deal" entityId="d1" onNoteCreated={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(createNoteAction).not.toHaveBeenCalled();
  });

  it("calls onCancel from the Cancel button (PD collapses the editor back to its prompt)", () => {
    const onCancel = vi.fn();
    render(
      <ComposeNoteTab
        entityType="deal"
        entityId="d1"
        onNoteCreated={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
