// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { LeadDetail } from "../leadRepo";

beforeAll(() => {
  // Radix DropdownMenu (the "More lead actions" overflow menu) needs these in jsdom.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: { customFields: { listDefs: { useQuery: () => ({ data: [], isLoading: false }) } } },
}));
vi.mock("../leadServerActions", () => ({
  convertLeadAction: vi.fn(),
  archiveLeadAction: vi.fn(),
  bulkUpdateLeadsAction: vi.fn(),
  updateLeadAction: vi.fn(),
}));

// The shared app-wide error reporter (mounted in the (app) shell). Mocked so a mutation's
// else-branch report is observable without rendering the provider.
const reportError = vi.fn();
vi.mock("@/components/shell/ActionErrorProvider", () => ({
  useActionError: () => reportError,
}));

// LeadHeader resolves its label chips through a trpc-backed hook; stub it so the header renders
// without a tRPC provider (this test is about the mutation error-surfacing, not label rendering).
vi.mock("@/features/labels/useLabelChipResolver", () => ({
  useLabelChipResolver: () => () => [],
}));

import { LeadHeader } from "./LeadHeader";

const LEAD = {
  id: "l1",
  title: "Acme lead",
  labels: [],
  ownerName: "Nick",
  archivedAt: null,
  convertedDealId: null,
  updatedAt: new Date("2026-06-01T00:00:00Z"),
} as unknown as LeadDetail;

describe("LeadHeader PD lead-drawer parity", () => {
  it("does not render the owner in the header (PD shows owner as a sidebar field, not a header badge)", () => {
    render(<LeadHeader lead={LEAD} />);
    // Owner lives in the Summary sidebar row, so the header must not duplicate it.
    expect(screen.queryByText("Nick")).not.toBeInTheDocument();
    // The primary title still renders.
    const heading = screen.getByRole("heading", { name: "Acme lead" });
    expect(heading).toHaveClass("text-[25px]");
    const titleRow = heading.closest("header")?.firstElementChild;
    expect(titleRow).toHaveClass("justify-between", "gap-4");
    expect(titleRow?.firstElementChild).not.toHaveClass("flex-1");
  });

  it("styles Convert to deal as a positive/success action (PD's green convert button)", () => {
    render(<LeadHeader lead={LEAD} />);
    const btn = screen.getByRole("button", { name: "Convert to deal" });
    expect(btn.className).toContain("bg-success");
    expect(btn.className).not.toContain("bg-primary");
  });

  it("edits the lead title with the same inline-edit footer as a deal title", async () => {
    const user = userEvent.setup();
    const { updateLeadAction } = await import("../leadServerActions");
    vi.mocked(updateLeadAction).mockResolvedValue({
      ok: true,
      value: { id: "l1", updatedAt: "2026-06-01T00:00:01.000Z" },
    });
    render(<LeadHeader lead={LEAD} />);

    await user.click(screen.getByRole("button", { name: "Edit lead title" }));
    const input = screen.getByRole("textbox", { name: "Edit lead title" });
    await user.clear(input);
    await user.type(input, "Acme enterprise lead");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateLeadAction).toHaveBeenCalledWith(
        {
          leadId: "l1",
          expectedUpdatedAt: "2026-06-01T00:00:00.000Z",
          title: "Acme enterprise lead",
        },
        "csrf",
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("cancels a lead title edit through the shared footer", async () => {
    const user = userEvent.setup();
    const { updateLeadAction } = await import("../leadServerActions");
    render(<LeadHeader lead={LEAD} />);

    await user.click(screen.getByRole("button", { name: "Edit lead title" }));
    const input = screen.getByRole("textbox", { name: "Edit lead title" });
    await user.clear(input);
    await user.type(input, "Do not save");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(updateLeadAction).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Acme lead" })).toBeInTheDocument();
  });
});

describe("LeadHeader error surfacing", () => {
  it("surfaces a failed title update through the shared error reporter", async () => {
    const user = userEvent.setup();
    const { updateLeadAction } = await import("../leadServerActions");
    vi.mocked(updateLeadAction).mockResolvedValue({ ok: false, error: { id: "E_LEAD_007" } });
    render(<LeadHeader lead={LEAD} />);

    await user.click(screen.getByRole("button", { name: "Edit lead title" }));
    const input = screen.getByRole("textbox", { name: "Edit lead title" });
    await user.clear(input);
    await user.type(input, "Conflicting update");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_LEAD_007"));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("surfaces a failed convert through the shared error reporter", async () => {
    const { convertLeadAction } = await import("../leadServerActions");
    vi.mocked(convertLeadAction).mockResolvedValue({ ok: false, error: { id: "E_PERM_001" } });
    render(<LeadHeader lead={LEAD} />);

    await userEvent.click(screen.getByRole("button", { name: "Convert to deal" }));

    await waitFor(() => expect(convertLeadAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
    expect(push).not.toHaveBeenCalled();
  });

  it("surfaces a failed archive toggle through the shared error reporter", async () => {
    const { archiveLeadAction } = await import("../leadServerActions");
    vi.mocked(archiveLeadAction).mockResolvedValue({ ok: false, error: { id: "E_PERM_001" } });
    render(<LeadHeader lead={LEAD} />);

    await userEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(archiveLeadAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("surfaces a failed delete through the shared error reporter", async () => {
    const user = userEvent.setup();
    const { bulkUpdateLeadsAction } = await import("../leadServerActions");
    vi.mocked(bulkUpdateLeadsAction).mockResolvedValue({ ok: false, error: { id: "E_PERM_001" } });
    render(<LeadHeader lead={LEAD} />);

    await user.click(screen.getByRole("button", { name: "More lead actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete lead" }));

    await waitFor(() => expect(bulkUpdateLeadsAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
    expect(push).not.toHaveBeenCalled();
  });
});
