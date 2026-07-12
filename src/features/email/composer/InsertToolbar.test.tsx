// @vitest-environment jsdom
// InsertToolbar.test.tsx: component tests for template application (Task 4.2)
// RED: fails until InsertToolbar exists and wires template fetch + state
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The Combobox (Popover + cmdk) needs these jsdom polyfills.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  // cmdk observes its list size; jsdom has no ResizeObserver.
  global.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
});

afterEach(cleanup);

// Opens the template combobox by its trigger label, then clicks the option by its text.
function pickTemplate(optionText: string): void {
  fireEvent.click(screen.getByLabelText(/choose template/i));
  fireEvent.click(screen.getByRole("option", { name: optionText }));
}

// Use vi.hoisted so the mock fn is available inside the vi.mock factory (which is hoisted
// above all imports by Vitest's transform).
const { getTemplateMock } = vi.hoisted(() => ({ getTemplateMock: vi.fn() }));

// Mock trpc: templates.list returns two entries; templates.get respects the `enabled`
// option (item 10d) so tests can assert the guard prevents a fetch.
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    email: {
      templates: {
        list: {
          useQuery: () => ({
            data: [
              { id: "t1", name: "Welcome", subject: "Welcome!" },
              { id: "t2", name: "Follow Up", subject: "Following up" },
            ],
          }),
        },
        get: {
          // Respect the enabled guard: return { data: undefined } when disabled.
          useQuery: (input: unknown, opts: { enabled?: boolean } = {}) => {
            if (opts.enabled === false) return { data: undefined };
            return getTemplateMock(input, opts);
          },
        },
      },
    },
  },
}));

// SaveAsTemplateDialog pulls in trpc.useUtils + the ActionError context; stub it to a marker that
// only appears while `open`, so the footer's "Save draft as a template" action is observable.
vi.mock("./SaveAsTemplateDialog", () => ({
  SaveAsTemplateDialog: (props: { open?: boolean }) =>
    props.open === true ? <div data-testid="save-template-dialog" /> : null,
}));

import { InsertToolbar } from "./InsertToolbar";
import type { InsertFieldContext } from "./insertFields";

const DEAL_CONTEXT: InsertFieldContext = {
  kind: "deal",
  dealId: "d1",
  dealTitle: "Acme Deal",
  personFirstName: "Sofia",
  personEmail: "sofia@acme.com",
  orgName: "Acme Corp",
};

describe("InsertToolbar - Choose template", () => {
  it("renders a Choose template label with template options", () => {
    getTemplateMock.mockReturnValue({ data: undefined });
    render(<InsertToolbar onSubjectChange={vi.fn()} onBodyChange={vi.fn()} />);
    const trigger = screen.getByLabelText(/choose template/i);
    expect(trigger).toBeInTheDocument();
    // The combobox only mounts its option list once opened.
    fireEvent.click(trigger);
    expect(screen.getByRole("option", { name: /welcome/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /follow up/i })).toBeInTheDocument();
  });

  it("offers Save draft as a template + Manage templates in the dropdown footer (PD parity)", async () => {
    const user = userEvent.setup();
    getTemplateMock.mockReturnValue({ data: undefined });
    render(
      <InsertToolbar
        onSubjectChange={vi.fn()}
        onBodyChange={vi.fn()}
        subject="Hi"
        bodyHtml="<p>x</p>"
      />,
    );
    await user.click(screen.getByLabelText(/choose template/i));
    expect(screen.getByRole("link", { name: /manage templates/i })).toHaveAttribute(
      "href",
      "/settings/email",
    );
    // Clicking "Save draft as a template" opens the (stubbed) save dialog.
    await user.click(screen.getByRole("button", { name: /save draft as a template/i }));
    expect(screen.getByTestId("save-template-dialog")).toBeInTheDocument();
  });

  it("filters templates by the combobox search box (PD parity)", () => {
    getTemplateMock.mockReturnValue({ data: undefined });
    render(<InsertToolbar onSubjectChange={vi.fn()} onBodyChange={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/choose template/i));
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "follow" } });
    expect(screen.getByRole("option", { name: /follow up/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /welcome/i })).toBeNull();
  });

  it("calls onSubjectChange and onBodyChange when a template is selected and data loads", async () => {
    const onSubjectChange = vi.fn();
    const onBodyChange = vi.fn();

    // First render: no template selected yet
    getTemplateMock.mockReturnValue({ data: undefined });

    const { rerender } = render(
      <InsertToolbar onSubjectChange={onSubjectChange} onBodyChange={onBodyChange} />,
    );

    // Select template t1
    pickTemplate("Welcome");

    // Now simulate the query returning data for t1
    getTemplateMock.mockReturnValue({
      data: {
        id: "t1",
        name: "Welcome",
        subject: "Welcome!",
        bodyHtml: "<p>Hello there</p>",
      },
    });

    rerender(<InsertToolbar onSubjectChange={onSubjectChange} onBodyChange={onBodyChange} />);

    await waitFor(() => {
      expect(onSubjectChange).toHaveBeenCalledWith("Welcome!");
      expect(onBodyChange).toHaveBeenCalledWith("<p>Hello there</p>");
    });
  });
});

// ---------------------------------------------------------------------------
// Item 3: a background refetch after reset must NOT re-fire onSubjectChange/onBodyChange.
// The apply effect must only fire for an explicit user selection, not on every
// query-data change when no template is actively selected.
// ---------------------------------------------------------------------------
describe("InsertToolbar – refetch after reset does not re-apply stale template", () => {
  it("does not call onSubjectChange or onBodyChange when templateDetail arrives with no template selected", () => {
    const onSubjectChange = vi.fn();
    const onBodyChange = vi.fn();

    // Start with data already present but NO template selected (selectedTemplateId = "").
    // With the enabled-aware mock, useQuery gets enabled:false so returns {data:undefined}.
    // This also verifies that if the guard were removed and data somehow leaked through,
    // the apply effect would still be blocked by the selectedTemplateId === "" guard.
    getTemplateMock.mockReturnValue({
      data: { id: "t1", name: "Welcome", subject: "Welcome!", bodyHtml: "<p>Hello</p>" },
    });

    render(<InsertToolbar onSubjectChange={onSubjectChange} onBodyChange={onBodyChange} />);

    // Neither callback should have fired — no template was explicitly selected.
    expect(onSubjectChange).not.toHaveBeenCalled();
    expect(onBodyChange).not.toHaveBeenCalled();
  });

  // Item 10d: verify the enabled guard is actually wired up and tested.
  // The enabled-aware mock returns {data:undefined} when enabled=false (no template selected),
  // so even if getTemplateMock has stale data from a previous call, the callbacks don't fire.
  it("callbacks do not fire when no template is selected, even if stale data exists in mock", () => {
    const onSubjectChange = vi.fn();
    const onBodyChange = vi.fn();

    // Stale data in the mock — but enabled=false short-circuits to {data:undefined}.
    getTemplateMock.mockReturnValue({
      data: { id: "t1", subject: "Stale subject", bodyHtml: "<p>Stale body</p>" },
    });

    render(<InsertToolbar onSubjectChange={onSubjectChange} onBodyChange={onBodyChange} />);

    // No template selected → enabled=false → data is undefined → callbacks not called.
    expect(onSubjectChange).not.toHaveBeenCalled();
    expect(onBodyChange).not.toHaveBeenCalled();
  });
});

describe("InsertToolbar - Insert field", () => {
  it("renders an Insert field button when deal context is provided", () => {
    getTemplateMock.mockReturnValue({ data: undefined });
    const onInsert = vi.fn();
    render(
      <InsertToolbar
        onSubjectChange={vi.fn()}
        onBodyChange={vi.fn()}
        context={DEAL_CONTEXT}
        onInsertField={onInsert}
      />,
    );
    expect(screen.getByRole("button", { name: /insert field/i })).toBeInTheDocument();
  });

  // Task 2 (inbox compose parity): the inbox composer used to get an empty item list here
  // ([] from insertFields for kind:"inbox", same for undefined context) so InsertFieldMenu
  // rendered nothing. It now offers the merge-token catalog as literal {{token}} placeholders
  // (mirrors TemplateDraftEditor.tsx), so this scenario flips from "not rendered" to "rendered".
  it("renders Insert field with the merge-token catalog for inbox context", async () => {
    getTemplateMock.mockReturnValue({ data: undefined });
    const user = userEvent.setup();
    const onInsert = vi.fn();
    render(
      <InsertToolbar
        onSubjectChange={vi.fn()}
        onBodyChange={vi.fn()}
        context={{ kind: "inbox" }}
        onInsertField={onInsert}
      />,
    );

    const trigger = screen.getByRole("button", { name: /insert field/i });
    await user.click(trigger);

    const firstNameOption = await screen.findByRole("option", { name: /first name/i });
    await user.click(firstNameOption);

    expect(onInsert).toHaveBeenCalledWith("{{person.first_name}}");
  });

  // No context prop at all is how the inbox compose route (/inbox/compose) renders
  // InsertToolbar today: Composer receives no `context` prop, so it passes `undefined`
  // through. Same merge-token catalog must appear as for explicit kind:"inbox".
  it("renders Insert field with the merge-token catalog when no context is provided", async () => {
    getTemplateMock.mockReturnValue({ data: undefined });
    const user = userEvent.setup();
    const onInsert = vi.fn();
    render(
      <InsertToolbar onSubjectChange={vi.fn()} onBodyChange={vi.fn()} onInsertField={onInsert} />,
    );

    const trigger = screen.getByRole("button", { name: /insert field/i });
    await user.click(trigger);

    const firstNameOption = await screen.findByRole("option", { name: /first name/i });
    await user.click(firstNameOption);

    expect(onInsert).toHaveBeenCalledWith("{{person.first_name}}");
  });

  it("calls onInsertField with the field value when a field is chosen", async () => {
    getTemplateMock.mockReturnValue({ data: undefined });
    const user = userEvent.setup();
    const onInsert = vi.fn();
    render(
      <InsertToolbar
        onSubjectChange={vi.fn()}
        onBodyChange={vi.fn()}
        context={DEAL_CONTEXT}
        onInsertField={onInsert}
      />,
    );

    // Open the shadcn DropdownMenu (Radix opens on pointerdown, so drive with userEvent).
    await user.click(screen.getByRole("button", { name: /insert field/i }));

    // The menu items should appear; click "Deal title"
    const dealTitleOption = await screen.findByRole("option", { name: /deal title/i });
    await user.click(dealTitleOption);

    expect(onInsert).toHaveBeenCalledWith("Acme Deal");
  });
});
