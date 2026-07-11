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
vi.mock("../leadServerActions", () => ({
  convertLeadAction: vi.fn(),
  archiveLeadAction: vi.fn(),
  bulkUpdateLeadsAction: vi.fn(),
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

describe("LeadHeader error surfacing", () => {
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
