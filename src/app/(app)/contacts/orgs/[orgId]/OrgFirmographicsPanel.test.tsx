// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

type UpdateResultLike = { ok: true; value: { id: string } } | { ok: false; error: { id: string } };

const { updateOrgAction } = vi.hoisted(() => ({
  updateOrgAction: vi.fn(
    (): Promise<UpdateResultLike> => Promise.resolve({ ok: true, value: { id: "o1" } }),
  ),
}));
vi.mock("@/features/contacts/actions", () => ({ updateOrgAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

import { OrgFirmographicsPanel } from "./OrgFirmographicsPanel";

const org = {
  id: "o1",
  domain: "acme.com",
  industry: "SaaS",
  employeeCount: 200,
  annualRevenue: "5000000.00",
  linkedinUrl: "https://linkedin.com/company/acme",
};

describe("OrgFirmographicsPanel", () => {
  it("renders the firmographic fields from the org", () => {
    render(<OrgFirmographicsPanel org={org} onSaved={vi.fn()} />);
    expect(screen.getByText("acme.com")).toBeInTheDocument();
    expect(screen.getByText("SaaS")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
    expect(screen.getByText("5000000.00")).toBeInTheDocument();
    expect(screen.getByText("https://linkedin.com/company/acme")).toBeInTheDocument();
  });

  it("saves an edited Industry via updateOrgAction and calls onSaved", async () => {
    const onSaved = vi.fn();
    render(<OrgFirmographicsPanel org={org} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Industry" }));
    fireEvent.change(screen.getByLabelText("Industry"), { target: { value: "Fintech" } });
    fireEvent.keyDown(screen.getByLabelText("Industry"), { key: "Enter" });

    await vi.waitFor(() => expect(updateOrgAction).toHaveBeenCalled());
    const [payload, csrf] = updateOrgAction.mock.calls[0] as unknown as [
      Record<string, unknown>,
      string,
    ];
    expect(payload).toMatchObject({ id: "o1", industry: "Fintech" });
    expect(csrf).toBe("csrf");
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("saves an edited Employees count as a number", async () => {
    render(<OrgFirmographicsPanel org={org} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Employees" }));
    fireEvent.change(screen.getByLabelText("Employees"), { target: { value: "350" } });
    fireEvent.keyDown(screen.getByLabelText("Employees"), { key: "Enter" });

    await vi.waitFor(() => expect(updateOrgAction).toHaveBeenCalled());
    const [payload] = updateOrgAction.mock.calls[0] as unknown as [Record<string, unknown>, string];
    expect(payload).toMatchObject({ id: "o1", employeeCount: 350 });
  });

  it("clears Employees to null when the input is emptied", async () => {
    render(<OrgFirmographicsPanel org={org} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Employees" }));
    fireEvent.change(screen.getByLabelText("Employees"), { target: { value: "" } });
    fireEvent.keyDown(screen.getByLabelText("Employees"), { key: "Enter" });

    await vi.waitFor(() => expect(updateOrgAction).toHaveBeenCalled());
    const [payload] = updateOrgAction.mock.calls[0] as unknown as [Record<string, unknown>, string];
    expect(payload).toMatchObject({ id: "o1", employeeCount: null });
  });

  it("saves an edited Website/domain", async () => {
    render(<OrgFirmographicsPanel org={org} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Website" }));
    fireEvent.change(screen.getByLabelText("Website"), { target: { value: "acme.io" } });
    fireEvent.keyDown(screen.getByLabelText("Website"), { key: "Enter" });

    await vi.waitFor(() => expect(updateOrgAction).toHaveBeenCalled());
    const [payload] = updateOrgAction.mock.calls[0] as unknown as [Record<string, unknown>, string];
    expect(payload).toMatchObject({ id: "o1", domain: "acme.io" });
  });

  it("renders '+ Add' placeholders for null fields", () => {
    render(
      <OrgFirmographicsPanel
        org={{
          id: "o1",
          domain: null,
          industry: null,
          employeeCount: null,
          annualRevenue: null,
          linkedinUrl: null,
        }}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getAllByText("+ Add").length).toBeGreaterThanOrEqual(3);
  });

  it("renders the '+ Add' placeholder, not the literal 'undefined', when employeeCount is missing entirely", () => {
    const orgMissingKey = {
      id: "o1",
      domain: null,
      industry: null,
      annualRevenue: null,
      linkedinUrl: null,
      // employeeCount intentionally omitted, simulating a row fetched without the column.
    };
    render(<OrgFirmographicsPanel org={orgMissingKey as never} onSaved={vi.fn()} />);
    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
  });

  it("surfaces a save failure via an inline error", async () => {
    updateOrgAction.mockResolvedValueOnce({ ok: false, error: { id: "E_CONTACT_002" } });
    render(<OrgFirmographicsPanel org={org} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Industry" }));
    fireEvent.change(screen.getByLabelText("Industry"), { target: { value: "Fintech" } });
    fireEvent.keyDown(screen.getByLabelText("Industry"), { key: "Enter" });

    expect(await screen.findByText(/couldn.t save/i)).toBeInTheDocument();
  });
});
