// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  // cmdk (Combobox, used inside ActivityComposerInline) observes list size; jsdom has none.
  global.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
});

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

vi.mock("@/features/deal-workspace/composer/ActivityComposerInline", () => ({
  ActivityComposerInline: ({ onCancel }: { onCancel: () => void }) => (
    <div data-testid="activity-form">
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  ),
}));
vi.mock("@/features/email/Composer", () => ({
  Composer: ({ accountId, onSent }: { accountId: string; onSent: () => void }) => (
    <div data-testid="email-composer">
      composer:{accountId}
      <button type="button" onClick={onSent}>
        Send
      </button>
    </div>
  ),
}));
vi.mock("@/features/files/FileAttachments", () => ({ FileAttachments: () => <div /> }));
vi.mock("@/features/collaboration/actions", () => ({ createNoteAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { SharedComposeBar } from "./SharedComposeBar";

const scope = { entityType: "deal" as const, entityId: "d1" };
const leadScope = { entityType: "lead" as const, entityId: "l1" };

function renderBar(over: Partial<Parameters<typeof SharedComposeBar>[0]> = {}): void {
  render(
    <SharedComposeBar
      scope={scope}
      emailAccountId={null}
      onActivityCreated={vi.fn()}
      onNoteCreated={vi.fn()}
      {...over}
    />,
  );
}

describe("SharedComposeBar (Pipedrive default-state model)", () => {
  it("shows the tab strip AND the Activity prompt when collapsed (tabs are always visible)", () => {
    renderBar();
    expect(screen.getByRole("tab", { name: "Activity" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Notes" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Click here to add an activity..." }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("activity-form")).not.toBeInTheDocument();
  });

  it("orders Notes before Activity and selects Notes by default for lead scope (PD lead-drawer parity)", () => {
    renderBar({ scope: leadScope });
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Notes", "Activity"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    // The collapsed prompt is the note prompt, matching PD's "Take a note..." default state.
    expect(screen.getByRole("button", { name: "Take a note..." })).toBeInTheDocument();
  });

  it("keeps Activity first and selected by default for deal scope (unchanged)", () => {
    renderBar();
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveTextContent("Activity");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  it("has no collapse control in the tab row (PD collapses via the editor's Cancel only)", () => {
    renderBar();
    expect(screen.queryByRole("button", { name: "Collapse composer" })).not.toBeInTheDocument();
  });

  it("expands the activity composer from the prompt, and Cancel returns to the prompt", () => {
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Click here to add an activity..." }));
    expect(screen.getByTestId("activity-form")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("activity-form")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Click here to add an activity..." }),
    ).toBeInTheDocument();
  });

  it("clicking the Notes tab while collapsed expands the note editor directly (PD behavior)", async () => {
    renderBar();
    await userEvent.click(screen.getByRole("tab", { name: "Notes" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Note" })).toHaveFocus());
  });

  it("note Cancel collapses to the Notes prompt with the tab strip still visible", async () => {
    renderBar();
    await userEvent.click(screen.getByRole("tab", { name: "Notes" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox", { name: "Note" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take a note..." })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Notes" })).toHaveAttribute("aria-selected", "true");
  });

  it("flows a note through createNoteAction using the scope's entityType/entityId", async () => {
    const onNoteCreated = vi.fn();
    renderBar({ onNoteCreated });
    await userEvent.click(screen.getByRole("tab", { name: "Notes" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
      target: { value: "Follow up next week" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(createNoteAction).toHaveBeenCalledTimes(1));
    expect(createNoteAction.mock.calls[0]?.[0]).toMatchObject({
      entityType: "deal",
      entityId: "d1",
      body: "Follow up next week",
    });
    await waitFor(() => expect(onNoteCreated).toHaveBeenCalled());
  });

  it("shows the email composer directly on Email tab click (no collapsed prompt)", async () => {
    renderBar({ emailAccountId: "acct-1" });
    await userEvent.click(screen.getByRole("tab", { name: "Email" }));
    expect(screen.getByTestId("email-composer")).toHaveTextContent("composer:acct-1");
  });

  it("returns to the collapsed Activity prompt after sending an email (not an expanded editor)", async () => {
    renderBar({ emailAccountId: "acct-1" });
    await userEvent.click(screen.getByRole("tab", { name: "Email" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByRole("tab", { name: "Activity" })).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("button", { name: "Click here to add an activity..." }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("activity-form")).not.toBeInTheDocument();
  });

  it("prompts to connect a mailbox when no email account is linked", async () => {
    renderBar();
    await userEvent.click(screen.getByRole("tab", { name: "Email" }));
    expect(screen.queryByTestId("email-composer")).not.toBeInTheDocument();
    expect(screen.getByText(/connect a gmail mailbox/i)).toBeInTheDocument();
  });

  it("hides the Email and Files tabs for a lead scope, keeping only Activity and Notes", () => {
    renderBar({ scope: leadScope, emailAccountId: "acct-1" });
    expect(screen.getByRole("tab", { name: "Activity" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Notes" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Email" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Files" })).not.toBeInTheDocument();
  });

  it("flows a lead-scoped note through createNoteAction with entityType lead", async () => {
    const onNoteCreated = vi.fn();
    renderBar({ scope: leadScope, onNoteCreated });
    await userEvent.click(screen.getByRole("tab", { name: "Notes" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
      target: { value: "Qualify next" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(createNoteAction).toHaveBeenCalledTimes(1));
    expect(createNoteAction.mock.calls[0]?.[0]).toMatchObject({
      entityType: "lead",
      entityId: "l1",
      body: "Qualify next",
    });
    await waitFor(() => expect(onNoteCreated).toHaveBeenCalled());
  });
});
