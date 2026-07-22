// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { DealSidebar } from "./DealSidebar";
import type { DealWorkspace } from "./summaryRepo";

// Radix Popover / DropdownMenu need these jsdom shims (mirrors DealSidebar.orgLink.test.tsx).
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

vi.mock("@/features/deals/updateAction", () => ({ updateDealAction: vi.fn() }));
vi.mock("@/features/contacts/actions", () => ({
  updateOrgAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "o1" } })),
  updatePersonAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "p1" } })),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ deal: { participants: { invalidate: vi.fn() } } }),
    deal: { participants: { useQuery: () => ({ data: [] }) } },
    contacts: { listPeopleForOrg: { useQuery: () => ({ data: [] }) } },
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
  },
}));
vi.mock("@/features/deal-workspace/DealActionErrorProvider", () => ({
  useDealActionError: () => vi.fn(),
}));

afterEach(cleanup);

// Populated firmographics + contact points, so every row renders unless the entity's hidden set
// drops it.
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
      phones: [{ value: "+1 555 000 0000", primary: true }],
      emails: [{ value: "p@x.com", primary: true }],
      labels: [],
    },
    org: {
      id: "o1",
      name: "Org One",
      domain: "acme.com",
      industry: "Media",
      employeeCount: 42,
      annualRevenue: "1000000",
      linkedinUrl: null,
      address: null,
      labels: [],
    },
    customFieldDefs: [],
  } as unknown as DealWorkspace;
}

const showAll = (): boolean => false;

it("drops the org and person built-in rows the hidden sets name, threaded to the blocks", () => {
  render(
    <DealSidebar
      workspace={makeWorkspace()}
      now={new Date("2026-01-03T00:00:00Z")}
      isHidden={showAll}
      baseCurrency="USD"
      hiddenOrgFields={new Set(["industry", "annualRevenue"])}
      hiddenPersonFields={new Set(["phones"])}
    />,
  );

  // Hidden org rows are gone, non-hidden ones remain.
  expect(screen.queryByText("Industry")).not.toBeInTheDocument();
  expect(screen.queryByText("Annual revenue")).not.toBeInTheDocument();
  expect(screen.getByText("Website")).toBeInTheDocument();
  expect(screen.getByText("Number of employees")).toBeInTheDocument();

  // Hidden person row is gone, non-hidden one remains.
  expect(screen.queryByText("Phone")).not.toBeInTheDocument();
  expect(screen.getByText("Email")).toBeInTheDocument();
});

it("keeps every built-in row when nothing is hidden", () => {
  render(
    <DealSidebar
      workspace={makeWorkspace()}
      now={new Date("2026-01-03T00:00:00Z")}
      isHidden={showAll}
      baseCurrency="USD"
    />,
  );
  expect(screen.getByText("Industry")).toBeInTheDocument();
  expect(screen.getByText("Annual revenue")).toBeInTheDocument();
  expect(screen.getByText("Phone")).toBeInTheDocument();
});
