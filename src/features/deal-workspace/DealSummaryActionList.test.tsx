// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { updateDealAction, addParticipantAction, removeParticipantAction, createPersonAction } =
  vi.hoisted(() => ({
    updateDealAction: vi.fn(() =>
      Promise.resolve({ ok: true, deal: { id: "d1", updatedAt: "2026-01-03T00:00:00.000Z" } }),
    ),
    addParticipantAction: vi.fn(() => Promise.resolve({ ok: true })),
    removeParticipantAction: vi.fn(() => Promise.resolve({ ok: true })),
    createPersonAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "pnew" } })),
  }));
vi.mock("@/features/deals/updateAction", () => ({ updateDealAction }));
vi.mock("@/features/contacts/actions", () => ({ createPersonAction }));
vi.mock("@/features/deal-workspace/actions", () => ({
  addParticipantAction,
  removeParticipantAction,
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { personOptionsQuery, invalidatePersonOptions } = vi.hoisted(() => ({
  personOptionsQuery: {
    current: {
      data: [
        { id: "p2", name: "Ann Guest" },
        { id: "p3", name: "Bob Free" },
        { id: "p4", name: "Cara Far" },
      ] as Array<{ id: string; name: string }> | undefined,
      isError: false,
    },
  },
  invalidatePersonOptions: vi.fn(),
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      deal: { participants: { invalidate: vi.fn() } },
      contacts: {
        personOptions: { invalidate: invalidatePersonOptions },
        listPeopleForOrg: { invalidate: vi.fn() },
      },
    }),
    deal: {
      participants: {
        useQuery: () => ({
          data: [
            {
              personId: "p2",
              name: "Ann Guest",
              orgName: "North Labs",
              primaryEmail: "ann@x.com",
              phone: "555",
              ownerName: "Demo1",
              closedDeals: 0,
              openDeals: 1,
              nextActivityAt: null,
            },
          ],
        }),
      },
    },
    contacts: {
      personOptions: {
        useQuery: () => personOptionsQuery.current,
      },
      listPeopleForOrg: { useQuery: () => ({ data: [] }) },
    },
    labels: {
      listByTarget: {
        useQuery: () => ({
          data: [{ id: "l1", target: "deal", name: "Hot", color: "red", order: 0 }],
        }),
      },
    },
  },
}));

import { DealSummaryActionList } from "./DealSummaryActionList";

const baseDeal = {
  id: "d1",
  updatedAt: "2026-01-02T00:00:00.000Z",
  value: 58000,
  expectedCloseDate: null as string | null,
  labels: [] as string[],
};

function renderList(overrides: Partial<typeof baseDeal> = {}) {
  return render(
    <DealSummaryActionList
      deal={{ ...baseDeal, ...overrides }}
      person={{ id: "p1", name: "Lucas Cohen" }}
      org={{ id: "o1", name: "North Labs" }}
      baseCurrency="USD"
    />,
  );
}

it("renders the value as formatted currency, not a raw number (PD $-format)", () => {
  renderList();
  expect(screen.getByText("$58,000")).toBeInTheDocument();
  expect(screen.queryByText("58000")).not.toBeInTheDocument();
});

it("renders a null value as $0, matching PD's always-present value row", () => {
  renderList({ value: null as unknown as number });
  expect(screen.getByText("$0")).toBeInTheDocument();
});

it("links the org and person rows to their records (PD entity links)", () => {
  renderList();
  expect(screen.getByRole("link", { name: "North Labs" })).toHaveAttribute(
    "href",
    "/contacts/orgs/o1",
  );
  expect(screen.getByRole("link", { name: "Lucas Cohen" })).toHaveAttribute(
    "href",
    "/contacts/people/p1",
  );
});

it("shows no Owner or Probability rows (PD keeps those out of Summary)", () => {
  renderList();
  expect(screen.queryByText("Owner")).not.toBeInTheDocument();
  expect(screen.queryByText("Probability")).not.toBeInTheDocument();
});

it("offers the Add-labels dropdown trigger, and renders active chips when set", () => {
  const { unmount } = renderList();
  expect(screen.getByRole("button", { name: /add labels/i })).toBeInTheDocument();
  expect(screen.queryByText("Hot")).not.toBeInTheDocument();
  unmount();

  // Applied by catalog name; the chip renders and the picker list stays closed until opened.
  renderList({ labels: ["Hot"] });
  expect(screen.getByText("Hot")).toBeInTheDocument();
  expect(screen.queryByRole("menuitemcheckbox")).not.toBeInTheDocument();
});

it("toggles a label through the catalog dropdown picker via updateDealAction", async () => {
  const user = userEvent.setup();
  renderList();
  await user.click(screen.getByRole("button", { name: /add labels/i }));
  await user.click(await screen.findByRole("menuitemcheckbox", { name: /Hot/ }));
  await vi.waitFor(() => expect(updateDealAction).toHaveBeenCalled());
  const [payload] = updateDealAction.mock.calls[0] as unknown as [Record<string, unknown>];
  expect(payload.labels).toEqual(["Hot"]);
});

it("shows 'Set expected close date' as a CTA when unset, and the date when set", () => {
  const { unmount } = renderList();
  expect(screen.getByText("Set expected close date")).toBeInTheDocument();
  unmount();

  renderList({ expectedCloseDate: "2026-07-16" });
  expect(screen.getByText("Jul 16, 2026")).toBeInTheDocument();
  expect(screen.queryByText("Set expected close date")).not.toBeInTheDocument();
});

it("shows the participant count-link (PD parity) and opens the participants table dialog", async () => {
  renderList();
  // One participant in the mock -> the trigger reads "1 participant", not "+ Participants".
  fireEvent.click(screen.getByRole("button", { name: "1 participant" }));
  // Dialog table lists the participant as a person link with a remove control.
  expect(screen.getByRole("link", { name: "Ann Guest" })).toHaveAttribute(
    "href",
    "/contacts/people/p2",
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove Ann Guest" }));
  await vi.waitFor(() => expect(removeParticipantAction).toHaveBeenCalled());

  const field = screen.getByLabelText("Link participant");
  fireEvent.click(field);
  expect(screen.queryByRole("button", { name: "Ann Guest" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cara Far" })).toBeInTheDocument();
  fireEvent.change(field, { target: { value: "bob" } });
  fireEvent.mouseDown(screen.getByRole("button", { name: "Bob Free" }));
  await vi.waitFor(() => expect(addParticipantAction).toHaveBeenCalled());
  const [payload] = addParticipantAction.mock.calls[0] as unknown as [Record<string, unknown>];
  expect(payload.personId).toBe("p3");
  expect(createPersonAction).not.toHaveBeenCalled();
});

it("creates a new person from the participants dialog and links them (Add deal pattern)", async () => {
  renderList();
  fireEvent.click(screen.getByRole("button", { name: "1 participant" }));
  const field = screen.getByLabelText("Link participant");
  fireEvent.change(field, { target: { value: "Zed New" } });
  fireEvent.mouseDown(screen.getByRole("button", { name: "+ Add 'Zed New' as new person" }));
  await vi.waitFor(() => expect(addParticipantAction).toHaveBeenCalled());
  expect(createPersonAction).toHaveBeenCalledWith(
    { name: "Zed New", orgId: "o1", emails: [], phones: [], customFields: {} },
    "csrf",
  );
  const [payload] = addParticipantAction.mock.calls[0] as unknown as [Record<string, unknown>];
  expect(payload.personId).toBe("pnew");
});

it("keeps the link field disabled until the people list has loaded (no create-a-duplicate window)", () => {
  personOptionsQuery.current = { data: undefined, isError: false };
  try {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "1 participant" }));
    const field = screen.getByLabelText("Link participant");
    expect(field).toBeDisabled();
    fireEvent.change(field, { target: { value: "Bob Free" } });
    expect(screen.queryByRole("button", { name: /as new person/ })).not.toBeInTheDocument();
  } finally {
    personOptionsQuery.current = {
      data: [
        { id: "p2", name: "Ann Guest" },
        { id: "p3", name: "Bob Free" },
        { id: "p4", name: "Cara Far" },
      ],
      isError: false,
    };
  }
});

it("says so when the person was created but the link failed, and refreshes the people list", async () => {
  addParticipantAction.mockResolvedValueOnce({
    ok: false,
    error: { id: "E_PERM_001" },
  } as unknown as { ok: true });
  renderList();
  fireEvent.click(screen.getByRole("button", { name: "1 participant" }));
  fireEvent.change(screen.getByLabelText("Link participant"), { target: { value: "Zed New" } });
  fireEvent.mouseDown(screen.getByRole("button", { name: "+ Add 'Zed New' as new person" }));
  expect(
    await screen.findByText("Zed New was created but could not be linked (E_PERM_001)"),
  ).toBeInTheDocument();
  expect(invalidatePersonOptions).toHaveBeenCalled();
});

it("does not create a duplicate when the typed name is already a participant", async () => {
  renderList();
  fireEvent.click(screen.getByRole("button", { name: "1 participant" }));
  const field = screen.getByLabelText("Link participant");
  fireEvent.change(field, { target: { value: "ann guest" } });
  expect(screen.queryByRole("button", { name: /as new person/ })).not.toBeInTheDocument();
  fireEvent.keyDown(field, { key: "Enter" });
  expect(await screen.findByText("Ann Guest is already a participant")).toBeInTheDocument();
  expect(createPersonAction).not.toHaveBeenCalled();
  expect(addParticipantAction).not.toHaveBeenCalled();
});

it("ignores a second commit while the first create-and-link is still in flight", async () => {
  renderList();
  fireEvent.click(screen.getByRole("button", { name: "1 participant" }));
  const field = screen.getByLabelText("Link participant");
  fireEvent.change(field, { target: { value: "Zed New" } });
  fireEvent.keyDown(field, { key: "Enter" });
  fireEvent.keyDown(field, { key: "Enter" });
  await vi.waitFor(() => expect(addParticipantAction).toHaveBeenCalled());
  expect(createPersonAction).toHaveBeenCalledTimes(1);
});

it("surfaces a failed participant create inline instead of swallowing it", async () => {
  createPersonAction.mockResolvedValueOnce({
    ok: false,
    error: { id: "E_PERM_001" },
  } as unknown as { ok: true; value: { id: string } });
  renderList();
  fireEvent.click(screen.getByRole("button", { name: "1 participant" }));
  fireEvent.change(screen.getByLabelText("Link participant"), { target: { value: "Zed New" } });
  fireEvent.mouseDown(screen.getByRole("button", { name: "+ Add 'Zed New' as new person" }));
  expect(await screen.findByText("Could not create person (E_PERM_001)")).toBeInTheDocument();
  expect(addParticipantAction).not.toHaveBeenCalled();
});

it("edits the value ONLY via the pencil, with a dirty-gated Save footer (PD mechanism)", async () => {
  renderList();
  // The value text is plain/selectable, not a click target.
  fireEvent.click(screen.getByText("$58,000"));
  expect(screen.queryByLabelText("Value")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Edit Value" }));
  const input = screen.getByLabelText<HTMLInputElement>("Value");
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  fireEvent.change(input, { target: { value: "61000" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await vi.waitFor(() => expect(updateDealAction).toHaveBeenCalled());
  const [payload] = updateDealAction.mock.calls[0] as unknown as [Record<string, unknown>];
  expect(payload.value).toBe(61000);
});

it("value editor: blur does not commit and Cancel discards (PD: only Cancel/Save exit)", () => {
  renderList();
  fireEvent.click(screen.getByRole("button", { name: "Edit Value" }));
  const input = screen.getByLabelText<HTMLInputElement>("Value");
  fireEvent.change(input, { target: { value: "99999" } });
  fireEvent.blur(input);
  expect(screen.getByLabelText("Value")).toBeInTheDocument();
  expect(updateDealAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(updateDealAction).not.toHaveBeenCalled();
  expect(screen.getByText("$58,000")).toBeInTheDocument();
});

it("close date: prompt click opens the editor; picking a day needs Save to commit", async () => {
  renderList();
  fireEvent.click(screen.getByRole("button", { name: "Set expected close date" }));
  // Calendar opens immediately (PD behavior); picking a day only fills the draft. findByText:
  // the calendar is a next/dynamic chunk that loads on open.
  fireEvent.click(await screen.findByText("15"));
  expect(updateDealAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await vi.waitFor(() => expect(updateDealAction).toHaveBeenCalled());
  const [payload] = updateDealAction.mock.calls[0] as unknown as [Record<string, unknown>];
  expect(String(payload.expectedCloseDate)).toMatch(/^\d{4}-\d{2}-15$/);
});
