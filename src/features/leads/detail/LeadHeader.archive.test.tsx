// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DetailDrawerCloseContext } from "@/features/navigation/detailDrawerClose";
import type { LeadDetail } from "../leadRepo";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
const invalidateLeadList = vi.fn(async () => {});
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    customFields: { listDefs: { useQuery: () => ({ data: [], isLoading: false }) } },
    useUtils: () => ({ lead: { list: { invalidate: invalidateLeadList } } }),
  },
}));
const archiveLeadAction = vi.hoisted(() => vi.fn());
vi.mock("../leadServerActions", () => ({
  convertLeadAction: vi.fn(),
  archiveLeadAction,
  bulkUpdateLeadsAction: vi.fn(),
  updateLeadAction: vi.fn(),
}));
const reportError = vi.fn();
vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => reportError }));
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
  customFields: {},
} as unknown as LeadDetail;

const ARCHIVED = { ...LEAD, archivedAt: new Date("2026-06-02T00:00:00Z") } as LeadDetail;

describe("LeadHeader archive", () => {
  it("closes the drawer and refreshes the leads list after archiving", async () => {
    archiveLeadAction.mockResolvedValue({ ok: true, value: { id: "l1" } });
    const closeDrawer = vi.fn();
    render(
      <DetailDrawerCloseContext.Provider value={closeDrawer}>
        <LeadHeader lead={LEAD} />
      </DetailDrawerCloseContext.Provider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(closeDrawer).toHaveBeenCalledTimes(1));
    expect(invalidateLeadList).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("navigates to /leads after archiving when there is no drawer", async () => {
    archiveLeadAction.mockResolvedValue({ ok: true, value: { id: "l1" } });
    render(<LeadHeader lead={LEAD} />);
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/leads"));
    expect(invalidateLeadList).toHaveBeenCalledTimes(1);
  });

  it("keeps the drawer open on restore but still refreshes the leads list", async () => {
    archiveLeadAction.mockResolvedValue({ ok: true, value: { id: "l1" } });
    const closeDrawer = vi.fn();
    render(
      <DetailDrawerCloseContext.Provider value={closeDrawer}>
        <LeadHeader lead={ARCHIVED} />
      </DetailDrawerCloseContext.Provider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(invalidateLeadList).toHaveBeenCalledTimes(1));
    expect(refresh).toHaveBeenCalled();
    expect(closeDrawer).not.toHaveBeenCalled();
  });

  it("re-enables Archive and reports when the action rejects", async () => {
    archiveLeadAction.mockRejectedValue(new Error("network"));
    render(<LeadHeader lead={LEAD} />);
    const button = screen.getByRole("button", { name: "Archive" });
    await userEvent.click(button);
    await waitFor(() => expect(reportError).toHaveBeenCalledTimes(1));
    expect(button).not.toBeDisabled();
    expect(invalidateLeadList).not.toHaveBeenCalled();
  });
});
