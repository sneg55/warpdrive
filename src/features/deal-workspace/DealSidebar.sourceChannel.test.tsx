// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { DealSidebar } from "./DealSidebar";
import type { DealWorkspace } from "./summaryRepo";

const updateDealAction = vi.hoisted(() =>
  vi.fn((input: unknown, csrfToken: string | null) => {
    void input;
    void csrfToken;
    return Promise.resolve({
      ok: true,
      deal: { id: "d1", updatedAt: "2026-01-03T00:00:00.000Z" },
    });
  }),
);
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/features/deals/updateAction", () => ({
  updateDealAction: (input: unknown, csrfToken: string | null) =>
    updateDealAction(input, csrfToken),
}));
vi.mock("@/features/contacts/actions", () => ({
  updateOrgAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "o1" } })),
  updatePersonAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "p1" } })),
}));
// ParticipantsControl (Summary action list) queries tRPC on render; stub it.
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ deal: { participants: { invalidate: vi.fn() } } }),
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
    deal: { participants: { useQuery: () => ({ data: [] }) } },
    contacts: { listPeopleForOrg: { useQuery: () => ({ data: [] }) } },
  },
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  updateDealAction.mockClear();
  refresh.mockClear();
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
    person: null,
    org: null,
    customFieldDefs: [],
  } as unknown as DealWorkspace;
}

it("inline-edits the Source Channel row through the deal update action", async () => {
  render(
    <DealSidebar
      workspace={makeWorkspace()}
      now={new Date("2026-01-05T00:00:00Z")}
      isHidden={() => false}
      baseCurrency="USD"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Edit Channel" }));
  fireEvent.click(screen.getByLabelText("Channel"));
  fireEvent.click(screen.getByText("Inbound"));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await vi.waitFor(() =>
    expect(updateDealAction).toHaveBeenCalledWith(
      {
        dealId: "d1",
        expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
        sourceChannel: "inbound",
      },
      "csrf",
    ),
  );
  await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
});

it("inline-edits the Channel ID row through the deal update action", async () => {
  const ws = makeWorkspace();
  ws.deal.sourceChannelId = "EXT-1";
  render(
    <DealSidebar
      workspace={ws}
      now={new Date("2026-01-05T00:00:00Z")}
      isHidden={() => false}
      baseCurrency="USD"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Edit Channel ID" }));
  fireEvent.change(screen.getByLabelText("Channel ID"), { target: { value: "EXT-2" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await vi.waitFor(() =>
    expect(updateDealAction).toHaveBeenCalledWith(
      { dealId: "d1", expectedUpdatedAt: "2026-01-02T00:00:00.000Z", sourceChannelId: "EXT-2" },
      "csrf",
    ),
  );
});
