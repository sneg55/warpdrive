// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

type UpdateResultLike = { ok: true; value: { id: string } } | { ok: false; error: { id: string } };

const { updatePersonAction } = vi.hoisted(() => ({
  updatePersonAction: vi.fn(
    (): Promise<UpdateResultLike> => Promise.resolve({ ok: true, value: { id: "pe1" } }),
  ),
}));
vi.mock("@/features/contacts/actions", () => ({ updatePersonAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

import { PersonSummaryEditPanel, setPrimaryPoint } from "./PersonSummaryEditPanel";

describe("setPrimaryPoint", () => {
  it("inserts a single primary entry into an empty array", () => {
    expect(setPrimaryPoint([], "new@acme.com")).toEqual([
      { label: "work", value: "new@acme.com", primary: true },
    ]);
  });

  it("replaces the existing primary entry's value while keeping non-primary entries", () => {
    const points = [
      { label: "work", value: "old@acme.com", primary: true },
      { label: "home", value: "home@acme.com", primary: false },
    ];
    expect(setPrimaryPoint(points, "new@acme.com")).toEqual([
      { label: "work", value: "new@acme.com", primary: true },
      { label: "home", value: "home@acme.com", primary: false },
    ]);
  });

  it("drops the primary entry (keeping the rest) when the value is cleared to blank", () => {
    const points = [
      { label: "work", value: "old@acme.com", primary: true },
      { label: "home", value: "home@acme.com", primary: false },
    ];
    expect(setPrimaryPoint(points, "  ")).toEqual([
      { label: "home", value: "home@acme.com", primary: false },
    ]);
  });
});

const person = {
  id: "pe1",
  name: "Jane Roe",
  emails: [{ label: "work", value: "jane@acme.com", primary: true }],
  phones: [{ label: "mobile", value: "+14155550100", primary: true }],
  orgId: "o1" as string | null,
};

const orgOptions = [
  { id: "o1", name: "Acme Inc" },
  { id: "o2", name: "Globex" },
];

describe("PersonSummaryEditPanel", () => {
  it("saves an edited Name", async () => {
    render(<PersonSummaryEditPanel person={person} orgOptions={orgOptions} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Name" }));
    const input = screen.getByLabelText("Name");
    fireEvent.change(input, { target: { value: "Jane Smith" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await vi.waitFor(() => expect(updatePersonAction).toHaveBeenCalled());
    const [payload, csrf] = updatePersonAction.mock.calls[0] as unknown as [
      Record<string, unknown>,
      string,
    ];
    expect(payload).toEqual({ id: "pe1", name: "Jane Smith" });
    expect(csrf).toBe("csrf");
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("saves the Primary email through setPrimaryPoint", async () => {
    render(<PersonSummaryEditPanel person={person} orgOptions={orgOptions} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Primary email" }));
    const input = screen.getByLabelText("Primary email");
    fireEvent.change(input, { target: { value: "new@acme.com" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await vi.waitFor(() => expect(updatePersonAction).toHaveBeenCalled());
    const [payload] = updatePersonAction.mock.calls[0] as unknown as [
      Record<string, unknown>,
      string,
    ];
    expect(payload).toEqual({
      id: "pe1",
      emails: [{ label: "work", value: "new@acme.com", primary: true }],
    });
  });

  it("saves the Primary phone through setPrimaryPoint", async () => {
    render(<PersonSummaryEditPanel person={person} orgOptions={orgOptions} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Primary phone" }));
    const input = screen.getByLabelText("Primary phone");
    fireEvent.change(input, { target: { value: "+14155550199" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await vi.waitFor(() => expect(updatePersonAction).toHaveBeenCalled());
    const [payload] = updatePersonAction.mock.calls[0] as unknown as [
      Record<string, unknown>,
      string,
    ];
    // setPrimaryPoint always writes label "work" for the new primary entry (matches the
    // deal-workspace convention: label is cosmetic, "primary" is the meaningful flag).
    expect(payload).toEqual({
      id: "pe1",
      phones: [{ label: "work", value: "+14155550199", primary: true }],
    });
  });

  it("saves Organization via the select's dirty-gated Save (PD mechanism, no autosave)", async () => {
    render(<PersonSummaryEditPanel person={person} orgOptions={orgOptions} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Organization" }));
    fireEvent.click(screen.getByLabelText("Organization"));
    fireEvent.click(screen.getByText("Globex"));
    expect(updatePersonAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(updatePersonAction).toHaveBeenCalled());
    const [payload] = updatePersonAction.mock.calls[0] as unknown as [
      Record<string, unknown>,
      string,
    ];
    expect(payload).toEqual({ id: "pe1", orgId: "o2" });
  });

  it("has no CAS/expectedUpdatedAt field in the save payload (last-write-wins)", async () => {
    render(<PersonSummaryEditPanel person={person} orgOptions={orgOptions} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Name" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Jane Smith" } });
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Enter" });

    await vi.waitFor(() => expect(updatePersonAction).toHaveBeenCalled());
    const [payload] = updatePersonAction.mock.calls[0] as unknown as [
      Record<string, unknown>,
      string,
    ];
    expect(payload).not.toHaveProperty("expectedUpdatedAt");
  });

  it("calls the onSaved callback instead of router.refresh when provided", async () => {
    const onSaved = vi.fn();
    render(<PersonSummaryEditPanel person={person} orgOptions={orgOptions} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Name" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Jane Smith" } });
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Enter" });

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("surfaces a permission-specific save failure via an inline error", async () => {
    updatePersonAction.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } });
    render(<PersonSummaryEditPanel person={person} orgOptions={orgOptions} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Name" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Jane Smith" } });
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Enter" });

    // E_PERM_001 (contact.edit denied) reads as a permission message, not a bare "Couldn't save".
    expect(await screen.findByText(/permission/i)).toBeInTheDocument();
  });

  // CONTACTS-20 / INLINE-EDIT-13 (mirrors OrgSummaryEditPanel): a failed save must NOT trigger
  // router.refresh(), which in the real app remounts the field and wipes the inline error the user
  // needs to see. The mocked refresh is inert here, so we assert it was never called at all.
  it("does not refresh on a failed save (keeps the inline error visible)", async () => {
    updatePersonAction.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } });
    render(<PersonSummaryEditPanel person={person} orgOptions={orgOptions} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Name" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Jane Smith" } });
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Enter" });

    expect(await screen.findByText(/permission/i)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not call onSaved on a failed save (only resyncs on success)", async () => {
    const onSaved = vi.fn();
    updatePersonAction.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } });
    render(<PersonSummaryEditPanel person={person} orgOptions={orgOptions} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Name" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Jane Smith" } });
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Enter" });

    expect(await screen.findByText(/permission/i)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
