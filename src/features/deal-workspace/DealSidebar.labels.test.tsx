// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { DealSidebar } from "./DealSidebar";
import { makeWorkspace, showAll } from "./dealSidebarFixtures";

// The Summary label picker (LabelRow -> updateDealAction under the CAS precondition), split out of
// DealSidebar.test.tsx to keep that file under the size cap. Person + Organization now render their
// own "Add labels" pickers (ContactLabelsControl), so these tests scope the lookup to the Summary
// section's region.
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
type ContactUpdateResultLike =
  | { ok: true; value: { id: string } }
  | { ok: false; error: { id: string } };
const updateOrgAction = vi.fn((...args: unknown[]): Promise<ContactUpdateResultLike> => {
  void args;
  return Promise.resolve({ ok: true, value: { id: "o1" } });
});
const updatePersonAction = vi.fn((...args: unknown[]): Promise<ContactUpdateResultLike> => {
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

// Open the Summary section's "Add labels" picker (not the Person/Organization ones).
function openSummaryLabels(): HTMLElement {
  return within(screen.getByRole("region", { name: "Summary" })).getByRole("button", {
    name: /add labels/i,
  });
}

it("edits labels via the catalog dropdown and calls updateDealAction with the CAS precondition", async () => {
  const user = userEvent.setup();
  updateDealAction.mockClear();
  refresh.mockClear();
  render(
    <DealSidebar
      workspace={makeWorkspace({ labels: [] })}
      now={new Date()}
      isHidden={showAll}
      baseCurrency="USD"
    />,
  );
  await user.click(openSummaryLabels());
  await user.click(await screen.findByRole("menuitemcheckbox", { name: /Hot/ }));
  await vi.waitFor(() => expect(updateDealAction).toHaveBeenCalledTimes(1));
  const [input, csrf] = updateDealAction.mock.calls[0] ?? [];
  expect(csrf).toBe("csrf");
  expect(input).toMatchObject({
    dealId: "d1",
    // makeWorkspace().deal.updatedAt (2026-01-02T00:00:00Z) serializes to this ISO string.
    expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
  });
  expect((input as { labels: string[] }).labels).toHaveLength(1);
  await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
});

it("surfaces a stale hint and refreshes when the CAS precondition fails", async () => {
  updateDealAction.mockClear();
  refresh.mockClear();
  // E_DEAL_002 is ERROR_IDS.DEAL_PRECONDITION (the compare-and-swap failure the row must handle).
  const user = userEvent.setup();
  updateDealAction.mockResolvedValueOnce({ ok: false, error: { id: "E_DEAL_002" } });
  render(
    <DealSidebar
      workspace={makeWorkspace({ labels: [] })}
      now={new Date()}
      isHidden={showAll}
      baseCurrency="USD"
    />,
  );
  await user.click(openSummaryLabels());
  await user.click(await screen.findByRole("menuitemcheckbox", { name: /Hot/ }));
  await vi.waitFor(() =>
    expect(screen.getByText("Labels changed elsewhere; reloaded.")).toBeInTheDocument(),
  );
  await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
});
