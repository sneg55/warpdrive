// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { updateDealAction, createOrgAction } = vi.hoisted(() => ({
  updateDealAction: vi.fn(() => Promise.resolve({ ok: true, deal: { id: "d1", updatedAt: "x" } })),
  createOrgAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "new-org" } })),
}));
vi.mock("@/features/deals/updateAction", () => ({ updateDealAction }));
vi.mock("@/features/contacts/actions", () => ({ createOrgAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { InlineOrgField } from "./InlineOrgField";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const options = [
  { id: "o1", name: "North Labs" },
  { id: "o2", name: "Union Dynamics" },
];
const baseProps = {
  dealId: "d1",
  expectedUpdatedAt: "2026-07-02T00:00:00.000Z",
  orgOptions: options,
  onSaved: vi.fn(),
};

describe("InlineOrgField", () => {
  it("shows the org as a record link and enters edit mode only via the pencil", () => {
    render(<InlineOrgField {...baseProps} org={{ id: "o1", name: "North Labs" }} />);
    expect(screen.getByRole("link", { name: "North Labs" })).toHaveAttribute(
      "href",
      "/contacts/orgs/o1",
    );
    // The name is not itself a click-to-edit target; the editor appears only after the pencil.
    expect(screen.queryByLabelText("Organization")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit Organization" }));
    expect(screen.getByLabelText("Organization")).toBeInTheDocument();
    // Dirty-gated: nothing chosen yet, so Save is disabled (PD: no autosave).
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("offers an 'Add organization' prompt for a deal with no org, opening the editor", () => {
    render(<InlineOrgField {...baseProps} org={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Add organization" }));
    expect(screen.getByLabelText("Organization")).toBeInTheDocument();
  });

  it("links the deal to a chosen existing org via updateDealAction (no create)", async () => {
    render(<InlineOrgField {...baseProps} org={{ id: "o1", name: "North Labs" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Organization" }));
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Union" } });
    fireEvent.mouseDown(screen.getByRole("button", { name: "Union Dynamics" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateDealAction).toHaveBeenCalled());
    const [payload] = updateDealAction.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(payload.orgId).toBe("o2");
    expect(createOrgAction).not.toHaveBeenCalled();
  });

  it("creates a new org when typed, then links the deal to the new org's id", async () => {
    render(<InlineOrgField {...baseProps} org={null} orgOptions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add organization" }));
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Brand New Co" } });
    fireEvent.mouseDown(
      screen.getByRole("button", { name: /Add 'Brand New Co' as new organization/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(createOrgAction).toHaveBeenCalled());
    const [createInput] = createOrgAction.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(createInput.name).toBe("Brand New Co");
    await waitFor(() => expect(updateDealAction).toHaveBeenCalled());
    const [payload] = updateDealAction.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(payload.orgId).toBe("new-org");
  });

  it("Cancel discards the pending choice without calling any action", () => {
    render(<InlineOrgField {...baseProps} org={{ id: "o1", name: "North Labs" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Organization" }));
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Union" } });
    fireEvent.mouseDown(screen.getByRole("button", { name: "Union Dynamics" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(updateDealAction).not.toHaveBeenCalled();
    expect(createOrgAction).not.toHaveBeenCalled();
    // Back to the view state (link visible again).
    expect(screen.getByRole("link", { name: "North Labs" })).toBeInTheDocument();
  });
});
