// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { DealSidebar } from "./DealSidebar";
import type { DealWorkspace } from "./summaryRepo";

// Radix Popover / DropdownMenu need these jsdom shims (mirrors DealSidebar.test.tsx).
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  global.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
});

type UpdateResultLike =
  | { ok: true; deal: { id: string; updatedAt: string } }
  | { ok: false; error: { id: string } };
const updateDealAction = vi.fn((...args: unknown[]): Promise<UpdateResultLike> => {
  void args;
  return Promise.resolve({ ok: true, deal: { id: "d1", updatedAt: "2026-01-03T00:00:00.000Z" } });
});
vi.mock("@/features/deals/updateAction", () => ({
  updateDealAction: (...args: unknown[]) => updateDealAction(...args),
}));
vi.mock("@/features/contacts/actions", () => ({
  updateOrgAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "o1" } })),
  updatePersonAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "p1" } })),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ deal: { participants: { invalidate: vi.fn() } } }),
    deal: { participants: { useQuery: () => ({ data: [] }) } },
    contacts: { listPeopleForOrg: { useQuery: () => ({ data: [] }) } },
    // The sidebar's LabelRow reads the label catalog (added by the label-catalog merge).
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
  },
}));
const reportError = vi.fn();
vi.mock("@/features/deal-workspace/DealActionErrorProvider", () => ({
  useDealActionError: () => reportError,
}));

afterEach(() => {
  cleanup();
  updateDealAction.mockClear();
  refresh.mockClear();
  reportError.mockClear();
});

function makeWorkspace(): DealWorkspace {
  return {
    deal: {
      id: "d1",
      title: "Acme",
      value: "1000.00",
      labels: [],
      sourceChannel: "outbound",
      sourceChannelId: null,
      expectedCloseDate: null,
      customFields: {},
      createdAt: new Date("2026-01-01T00:00:00Z"),
      lastActivityAt: null,
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    },
    ownerName: "Owner One",
    person: {
      id: "p1",
      name: "Person One",
      firstName: null,
      lastName: null,
      primaryEmail: "p@x.com",
      phones: [],
      emails: [],
    },
    org: {
      id: "o1",
      name: "Org One",
      domain: null,
      industry: null,
      employeeCount: null,
      annualRevenue: null,
      linkedinUrl: null,
      address: null,
    },
    customFieldDefs: [],
  } as unknown as DealWorkspace;
}

const showAll = (): boolean => false;

it("surfaces the error and does not refresh when unlinking the organization is denied", async () => {
  updateDealAction.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } });
  const user = userEvent.setup();
  render(
    <DealSidebar
      workspace={makeWorkspace()}
      now={new Date()}
      isHidden={showAll}
      baseCurrency="USD"
    />,
  );
  await user.click(screen.getByRole("button", { name: "Organization options" }));
  await user.click(screen.getByRole("menuitem", { name: "Unlink this organization" }));
  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
  expect(refresh).not.toHaveBeenCalled();
});
