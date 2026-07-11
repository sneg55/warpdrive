// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const { updateCompanyGeneralAction } = vi.hoisted(() => ({
  updateCompanyGeneralAction: vi.fn(() => Promise.resolve({ ok: true as const })),
}));
vi.mock("@/features/settings/actions", () => ({ updateCompanyGeneralAction }));

import { CompanyGeneralClient } from "./CompanyGeneralClient";

describe("CompanyGeneralClient", () => {
  it("renders the base currency read-only", () => {
    render(<CompanyGeneralClient companyName="Acme" baseCurrency="EUR" />);
    expect(screen.getByText("EUR")).toBeInTheDocument();
    // No editable currency control.
    expect(screen.queryByLabelText("Base currency")).toBeNull();
  });

  it("saves the edited company name via the action", async () => {
    render(<CompanyGeneralClient companyName="Acme" baseCurrency="USD" />);
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Acme Corp" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(updateCompanyGeneralAction).toHaveBeenCalledWith({ companyName: "Acme Corp" }, "csrf"),
    );
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });
});
