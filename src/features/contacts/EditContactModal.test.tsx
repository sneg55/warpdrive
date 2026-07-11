// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CustomFieldDef } from "@/types/customFields";

// Radix Select (branded dropdown) needs these jsdom polyfills.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

const { updatePersonAction, updateOrgAction } = vi.hoisted(() => ({
  updatePersonAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "pe1" } })),
  updateOrgAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "o1" } })),
}));
vi.mock("./actions", () => ({ updatePersonAction, updateOrgAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "tok" }));
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
    },
    customFields: {
      hiddenBuiltins: {
        useQuery: () => ({ data: { person: [], organization: [], deal: [], activity: [] } }),
      },
    },
  },
}));

import { EditContactModal } from "./EditContactModal";

const roleDef: CustomFieldDef = {
  id: "cf1",
  targetEntity: "person",
  type: "text",
  name: "Role",
  key: "role",
  options: [],
  isRequired: false,
  isImportant: false,
  showInAddForm: false,
  order: 0,
  archivedAt: null,
};

const person = {
  id: "pe1",
  name: "Jane Roe",
  emails: [{ label: "Work", value: "jane@acme.com", primary: true }],
  phones: [{ label: "Mobile", value: "+14155550100", primary: true }],
  orgId: "o1",
  customFields: { role: "CTO" },
};

const org = {
  id: "o1",
  name: "Acme Inc",
  address: { city: "SF" },
  customFields: {},
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EditContactModal (person)", () => {
  it("prefills the current base and custom-field values", () => {
    render(
      <EditContactModal
        kind="person"
        person={person as never}
        defs={[roleDef]}
        onSaved={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByLabelText(/name/i)).toHaveValue("Jane Roe");
    expect(screen.getByDisplayValue("jane@acme.com")).toBeInTheDocument();
    // Custom field renders through the shared CustomFieldFormControl (aria-label = def.name).
    expect(screen.getByLabelText("Role")).toHaveValue("CTO");
  });

  it("submits edited base + custom fields to updatePersonAction with the csrf token, then onSaved", async () => {
    const onSaved = vi.fn();
    render(
      <EditContactModal
        kind="person"
        person={person as never}
        defs={[roleDef]}
        onSaved={onSaved}
        onClose={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Jane R. Roe" } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "CEO" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await vi.waitFor(() =>
      expect(updatePersonAction).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "pe1",
          name: "Jane R. Roe",
          orgId: "o1",
          emails: [expect.objectContaining({ value: "jane@acme.com" })],
          customFields: expect.objectContaining({ role: "CEO" }),
        }),
        "tok",
      ),
    );
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("the Organization control is a branded Select that emits the picked value", async () => {
    const onSaved = vi.fn();
    render(
      <EditContactModal
        kind="person"
        person={person as never}
        defs={[roleDef]}
        onSaved={onSaved}
        onClose={() => {}}
      />,
    );
    const trigger = screen.getByLabelText("Organization");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByText("Globex"));
    expect(trigger).toHaveTextContent("Globex");
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await vi.waitFor(() =>
      expect(updatePersonAction).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: "o2" }),
        "tok",
      ),
    );
  });

  it("shows an inline error and does not call onSaved when the action fails", async () => {
    updatePersonAction.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } } as never);
    const onSaved = vi.fn();
    render(
      <EditContactModal
        kind="person"
        person={person as never}
        defs={[]}
        onSaved={onSaved}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  // CONTACTS-11: an invalid email surfaces E_CONTACT_008 (CONTACT_UPDATE_INPUT_INVALID). It must
  // render a human message, not the raw id like "Could not save (E_CONTACT_008)".
  it("renders a human message (not the raw id) for E_CONTACT_008", async () => {
    updatePersonAction.mockResolvedValueOnce({
      ok: false,
      error: { id: "E_CONTACT_008" },
    } as never);
    render(
      <EditContactModal
        kind="person"
        person={person as never}
        defs={[]}
        onSaved={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).not.toHaveTextContent("E_CONTACT_008");
    expect(alert).toHaveTextContent(/check the highlighted fields/i);
  });
});

describe("EditContactModal (org)", () => {
  it("submits edited base + address to updateOrgAction with the csrf token", async () => {
    render(
      <EditContactModal
        kind="org"
        org={org as never}
        defs={[]}
        onSaved={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByLabelText(/name/i)).toHaveValue("Acme Inc");
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Acme LLC" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await vi.waitFor(() =>
      expect(updateOrgAction).toHaveBeenCalledWith(
        expect.objectContaining({ id: "o1", name: "Acme LLC" }),
        "tok",
      ),
    );
  });
});
