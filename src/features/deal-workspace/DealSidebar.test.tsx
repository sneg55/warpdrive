// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { DealSidebar } from "./DealSidebar";
import { hide, makeWorkspace, showAll } from "./dealSidebarFixtures";

// Radix Popover (labels + participants in the Summary action list) needs these jsdom shims.
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

// LabelRow (inside the Summary section) calls the deal-update action, reads the csrf cookie, and
// refreshes the router. Mock all three at the module boundary (mirrors ComposeBar.test.tsx) so the
// sidebar renders purely; the editing test asserts the action is called with the CAS precondition.
type UpdateResultLike =
  | { ok: true; deal: { id: string; updatedAt: string } }
  | { ok: false; error: { id: string } };
const updateDealAction = vi.fn((...args: unknown[]): Promise<UpdateResultLike> => {
  void args;
  return Promise.resolve({
    ok: true,
    deal: { id: "d1", updatedAt: "2026-01-03T00:00:00.000Z" },
  });
});
vi.mock("@/features/deals/updateAction", () => ({
  updateDealAction: (...args: unknown[]) => updateDealAction(...args),
}));
// OrgBlock (inside the Organization section) calls updateOrgAction for each firmographic field;
// PersonBlock calls updatePersonAction for first/last/phone/email. Both mocked at the module
// boundary the same way as updateDealAction above.
type OrgUpdateResultLike =
  | { ok: true; value: { id: string } }
  | { ok: false; error: { id: string } };
const updateOrgAction = vi.fn((...args: unknown[]): Promise<OrgUpdateResultLike> => {
  void args;
  return Promise.resolve({ ok: true, value: { id: "o1" } });
});
const updatePersonAction = vi.fn((...args: unknown[]): Promise<OrgUpdateResultLike> => {
  void args;
  return Promise.resolve({ ok: true, value: { id: "p1" } });
});
vi.mock("@/features/contacts/actions", () => ({
  updateOrgAction: (...args: unknown[]) => updateOrgAction(...args),
  updatePersonAction: (...args: unknown[]) => updatePersonAction(...args),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
// ParticipantsControl (inside the Summary action list) queries the deal's participants and the
// org's people via tRPC; stub both so the sidebar renders purely.
const participantRows: unknown[] = [];
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ deal: { participants: { invalidate: vi.fn() } } }),
    deal: { participants: { useQuery: () => ({ data: participantRows }) } },
    contacts: { listPeopleForOrg: { useQuery: () => ({ data: [] }) } },
    labels: {
      listByTarget: {
        useQuery: () => ({
          data: [{ id: "l1", target: "deal", name: "Hot", color: "red", order: 0 }],
        }),
      },
    },
  },
}));

afterEach(cleanup);

it("renders Summary, Person, and Organization when nothing is hidden", () => {
  render(
    <DealSidebar
      workspace={makeWorkspace()}
      now={new Date()}
      isHidden={showAll}
      baseCurrency="USD"
    />,
  );
  expect(screen.getByText("Summary")).toBeInTheDocument();
  expect(screen.getByText("Person")).toBeInTheDocument();
  expect(screen.getByText("Organization")).toBeInTheDocument();
});

it("opens every section by default (section content is visible without a click)", () => {
  render(
    <DealSidebar
      workspace={makeWorkspace()}
      now={new Date()}
      isHidden={showAll}
      baseCurrency="USD"
    />,
  );
  // Source content (defaults to collapsed before this change).
  expect(screen.getByText("Channel ID")).toBeInTheDocument();
  // Overview content (also defaulted collapsed).
  expect(screen.getByText("Deal age")).toBeInTheDocument();
});

it("omits the Summary section when summary is hidden", () => {
  render(
    <DealSidebar
      workspace={makeWorkspace()}
      now={new Date()}
      isHidden={hide("summary")}
      baseCurrency="USD"
    />,
  );
  expect(screen.queryByText("Summary")).not.toBeInTheDocument();
  // Source/Overview have no block id and always render.
  expect(screen.getByText("Source")).toBeInTheDocument();
});

it("omits Person and Organization when both are hidden", () => {
  render(
    <DealSidebar
      workspace={makeWorkspace()}
      now={new Date()}
      isHidden={hide("person", "organization")}
      baseCurrency="USD"
    />,
  );
  expect(screen.queryByText("Person")).not.toBeInTheDocument();
  expect(screen.queryByText("Organization")).not.toBeInTheDocument();
});

it("renders org firmographics and saves an edit via updateOrgAction", async () => {
  updateOrgAction.mockClear();
  render(
    <DealSidebar
      workspace={makeWorkspace({}, { domain: "acme.com", industry: "Media" })}
      now={new Date()}
      isHidden={showAll}
      baseCurrency="USD"
    />,
  );
  expect(screen.getByText("Industry")).toBeInTheDocument(); // firmographic row present
  expect(screen.getByText("Website")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit Website" }));
  fireEvent.change(screen.getByLabelText("editor-website"), { target: { value: "new.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await vi.waitFor(() =>
    expect(updateOrgAction).toHaveBeenCalledWith(
      expect.objectContaining({ domain: "new.com" }),
      "csrf",
    ),
  );
});

it("renders first/last name and saves via updatePersonAction", async () => {
  updatePersonAction.mockClear();
  render(
    <DealSidebar
      workspace={makeWorkspace({}, undefined, { firstName: "Mia", lastName: "Silva" })}
      now={new Date()}
      isHidden={showAll}
      baseCurrency="USD"
    />,
  );
  expect(screen.getByText("First name")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit First name" }));
  fireEvent.change(screen.getByLabelText("editor-firstName"), { target: { value: "Maria" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await vi.waitFor(() =>
    expect(updatePersonAction).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: "Maria" }),
      "csrf",
    ),
  );
});

it("renders the Participants section (person links + View All) only when participants exist", () => {
  // Zero participants: no section (matches PD's zero-state; the Summary CTA is the entry point).
  const { unmount } = render(
    <DealSidebar
      workspace={makeWorkspace()}
      now={new Date()}
      isHidden={showAll}
      baseCurrency="USD"
    />,
  );
  expect(screen.queryByRole("region", { name: "Participants" })).not.toBeInTheDocument();
  unmount();

  participantRows.push({
    personId: "p9",
    name: "Gale Guest",
    orgName: null,
    primaryEmail: null,
    phone: null,
    ownerName: null,
    closedDeals: 0,
    openDeals: 0,
    nextActivityAt: null,
  });
  try {
    render(
      <DealSidebar
        workspace={makeWorkspace()}
        now={new Date()}
        isHidden={showAll}
        baseCurrency="USD"
      />,
    );
    const section = screen.getByRole("region", { name: "Participants" });
    expect(section).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gale Guest" })).toHaveAttribute(
      "href",
      "/contacts/people/p9",
    );
    expect(screen.getByRole("button", { name: "View All" })).toBeInTheDocument();
  } finally {
    participantRows.length = 0;
  }
});

it("does not render a standalone Details section when the deal has no custom fields", () => {
  render(
    <DealSidebar
      workspace={makeWorkspace()}
      now={new Date()}
      isHidden={showAll}
      baseCurrency="USD"
    />,
  );
  expect(screen.queryByRole("region", { name: "Details" })).not.toBeInTheDocument();
  expect(screen.queryByText(/No custom fields yet/)).not.toBeInTheDocument();
});

it("renders deal custom fields inside Organization instead of a Details section", () => {
  const def = { id: "f1", type: "text", name: "Industry", key: "industry" };
  const workspace = { ...makeWorkspace(), customFieldDefs: [def] } as ReturnType<
    typeof makeWorkspace
  >;
  render(
    <DealSidebar workspace={workspace} now={new Date()} isHidden={showAll} baseCurrency="USD" />,
  );
  expect(screen.queryByRole("region", { name: "Details" })).not.toBeInTheDocument();
  const organization = within(screen.getByRole("region", { name: "Organization" }));
  expect(organization.getAllByText("Industry")).toHaveLength(2);
});
