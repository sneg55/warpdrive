// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

type ActionResultLike =
  | { ok: true; value: { id: string; updatedAt: string } }
  | { ok: false; error: { id: string } };

const { updateLeadAction } = vi.hoisted(() => ({
  updateLeadAction: vi.fn(
    (): Promise<ActionResultLike> =>
      Promise.resolve({ ok: true, value: { id: "l1", updatedAt: "2026-07-04T00:00:01.000Z" } }),
  ),
}));
vi.mock("@/features/leads/leadServerActions", () => ({ updateLeadAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

import { LeadSummaryEditPanel } from "./LeadSummaryEditPanel";

const lead = {
  id: "l1",
  updatedAt: "2026-07-04T00:00:00Z",
  value: 100,
  ownerId: "u1",
  ownerName: "Sam Jones" as string | null,
  expectedCloseDate: null as string | null,
};

const owners = [
  { id: "u1", name: "Sam Jones", avatarUrl: null },
  { id: "u2", name: "Ada Lovelace", avatarUrl: null },
];

describe("LeadSummaryEditPanel", () => {
  it("saves an edited Value with the CAS expectedUpdatedAt and the CSRF token", async () => {
    render(<LeadSummaryEditPanel lead={lead} owners={owners} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Value" }));
    const input = screen.getByLabelText("Value");
    fireEvent.change(input, { target: { value: "250" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await vi.waitFor(() => expect(updateLeadAction).toHaveBeenCalled());
    const [payload, csrf] = updateLeadAction.mock.calls[0] as unknown as [
      Record<string, unknown>,
      string,
    ];
    expect(payload.leadId).toBe("l1");
    expect(payload.value).toBe(250);
    expect(payload.expectedUpdatedAt).toBe("2026-07-04T00:00:00.000Z");
    expect(csrf).toBe("csrf");
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("renders the Owner as an OwnerBadge in view mode", () => {
    render(<LeadSummaryEditPanel lead={lead} owners={owners} />);
    expect(screen.getByText("Sam Jones")).toBeInTheDocument();
    // OwnerBadge wiring specifically (not just plain text): the Avatar renders as a
    // role="img" element labeled with the owner's name.
    expect(screen.getByRole("img", { name: "Sam Jones" })).toBeInTheDocument();
  });

  it("shows the real owner name (not the '+ Add' placeholder) when the current owner is missing from the assignable-users list (deactivated owner)", () => {
    const deactivatedOwnerLead = { ...lead, ownerId: "u9", ownerName: "Dana Deactivated" };
    // owners (trpc.identity.assignableUsers) filters is_active = true, so a deactivated owner
    // never appears here even though the lead still has a real, non-null owner.
    render(<LeadSummaryEditPanel lead={deactivatedOwnerLead} owners={owners} />);

    expect(screen.getByText("Dana Deactivated")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Dana Deactivated" })).toBeInTheDocument();
    expect(screen.queryByText("+ Add")).not.toBeInTheDocument();
  });

  it("saves Owner via the select's dirty-gated Save with the CAS expectedUpdatedAt", async () => {
    render(<LeadSummaryEditPanel lead={lead} owners={owners} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Owner" }));
    fireEvent.click(screen.getByLabelText("Owner"));
    fireEvent.click(screen.getByText("Ada Lovelace"));
    expect(updateLeadAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(updateLeadAction).toHaveBeenCalled());
    const [payload] = updateLeadAction.mock.calls[0] as unknown as [
      Record<string, unknown>,
      string,
    ];
    expect(payload.ownerId).toBe("u2");
    expect(payload.expectedUpdatedAt).toBe("2026-07-04T00:00:00.000Z");
  });

  it("saves Expected close via the date editor's Save with the CAS expectedUpdatedAt", async () => {
    render(
      <LeadSummaryEditPanel lead={{ ...lead, expectedCloseDate: "2026-07-04" }} owners={owners} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit Expected close" }));
    fireEvent.click(screen.getByText("15"));
    expect(updateLeadAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(updateLeadAction).toHaveBeenCalled());
    const [payload] = updateLeadAction.mock.calls[0] as unknown as [
      Record<string, unknown>,
      string,
    ];
    expect(payload.expectedCloseDate).toBe("2026-07-15");
    expect(payload.expectedUpdatedAt).toBe("2026-07-04T00:00:00.000Z");
  });

  it("calls the onSaved callback instead of router.refresh when provided", async () => {
    const onSaved = vi.fn();
    render(<LeadSummaryEditPanel lead={lead} owners={owners} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Value" }));
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "300" } });
    fireEvent.keyDown(screen.getByLabelText("Value"), { key: "Enter" });

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("resyncs via router.refresh even when the save fails (stale CAS)", async () => {
    updateLeadAction.mockResolvedValueOnce({ ok: false, error: { id: "E_LEAD_007" } });
    render(<LeadSummaryEditPanel lead={lead} owners={owners} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Value" }));
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "300" } });
    fireEvent.keyDown(screen.getByLabelText("Value"), { key: "Enter" });

    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(await screen.findByText(/couldn.t save/i)).toBeInTheDocument();
  });
});
