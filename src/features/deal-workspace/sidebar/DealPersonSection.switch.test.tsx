// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { Person } from "@/db/schema";

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
  createPersonAction: vi.fn(),
  updatePersonAction: () => Promise.resolve({ ok: true as const, value: { id: "p1" } }),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
const {
  invalidateParticipants,
  invalidateDealsForPerson,
  invalidatePersonOptions,
  personOptionsQuery,
} = vi.hoisted(() => ({
  invalidateParticipants: vi.fn(),
  invalidateDealsForPerson: vi.fn(),
  invalidatePersonOptions: vi.fn(),
  personOptionsQuery: vi.fn(() => ({
    data: [
      { id: "p1", name: "Peter Kuusisto" },
      { id: "p2", name: "Paul Burns" },
    ] as Array<{ id: string; name: string }> | undefined,
    isError: false,
  })),
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      deal: { participants: { invalidate: invalidateParticipants } },
      contacts: {
        dealsForPerson: { invalidate: invalidateDealsForPerson },
        personOptions: { invalidate: invalidatePersonOptions },
      },
    }),
    enrichment: { status: { useQuery: () => ({ data: { ready: false, providers: [] } }) } },
    contacts: { personOptions: { useQuery: personOptionsQuery } },
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
  },
}));
const reportError = vi.fn();
vi.mock("@/features/deal-workspace/DealActionErrorProvider", () => ({
  useDealActionError: () => reportError,
}));

import { DealPersonSection } from "./DealPersonSection";

const LOADED_PEOPLE = {
  data: [
    { id: "p1", name: "Peter Kuusisto" },
    { id: "p2", name: "Paul Burns" },
  ] as Array<{ id: string; name: string }> | undefined,
  isError: false,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  personOptionsQuery.mockReturnValue(LOADED_PEOPLE);
});

const PETER = {
  id: "p1",
  name: "Peter Kuusisto",
  firstName: "Peter",
  lastName: "Kuusisto",
  primaryEmail: null,
  emails: [],
  phones: [],
  labels: [],
  customFields: {},
  orgId: null,
} as unknown as Person;

function renderSection() {
  render(
    <DealPersonSection
      person={PETER}
      dealId="d1"
      expectedUpdatedAt="2026-01-02T00:00:00.000Z"
      personOptions={[]}
      menuItems={[{ label: "Customize fields", onSelect: vi.fn() }]}
      bulkEditing={false}
      onStartBulk={vi.fn()}
      onExitBulk={vi.fn()}
    />,
  );
}

async function openMenu(): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: /person options/i }));
}

it("offers switching and unlinking the linked person from the section menu", async () => {
  renderSection();
  await openMenu();
  expect(await screen.findByRole("menuitem", { name: /switch to another person/i })).toBeVisible();
  expect(screen.getByRole("menuitem", { name: /unlink this person/i })).toBeVisible();
});

it("unlinks the person through updateDealAction", async () => {
  renderSection();
  await openMenu();
  await userEvent.click(await screen.findByRole("menuitem", { name: /unlink this person/i }));
  await waitFor(() =>
    expect(updateDealAction).toHaveBeenCalledWith(
      { dealId: "d1", expectedUpdatedAt: "2026-01-02T00:00:00.000Z", personId: null },
      "csrf",
    ),
  );
  expect(invalidateParticipants).toHaveBeenCalled();
});

it("shows an inert field instead of an empty picker while the people list loads", async () => {
  personOptionsQuery.mockReturnValue({ data: undefined, isError: false });
  renderSection();
  await openMenu();
  await userEvent.click(await screen.findByRole("menuitem", { name: /switch to another person/i }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByLabelText("Person")).toBeDisabled();
  expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
});

it("says so when the people list cannot be loaded", async () => {
  personOptionsQuery.mockReturnValue({ data: undefined, isError: true });
  renderSection();
  await openMenu();
  await userEvent.click(await screen.findByRole("menuitem", { name: /switch to another person/i }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("alert")).toHaveTextContent(/could not load people/i);
});

it("keeps Save disabled until a different person is chosen", async () => {
  renderSection();
  await openMenu();
  await userEvent.click(await screen.findByRole("menuitem", { name: /switch to another person/i }));
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByLabelText("Person"));
  fireEvent.click(await screen.findByRole("option", { name: /Paul Burns/ }));
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
});

it("switches to another person from the dialog and refreshes the participants read", async () => {
  renderSection();
  await openMenu();
  await userEvent.click(await screen.findByRole("menuitem", { name: /switch to another person/i }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByLabelText("Person"));
  fireEvent.click(await screen.findByRole("option", { name: /Paul Burns/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(updateDealAction).toHaveBeenCalledWith(
      { dealId: "d1", expectedUpdatedAt: "2026-01-02T00:00:00.000Z", personId: "p2" },
      "csrf",
    ),
  );
  expect(invalidateParticipants).toHaveBeenCalled();
  expect(invalidateDealsForPerson).toHaveBeenCalled();
  expect(invalidatePersonOptions).toHaveBeenCalled();
});

it("refreshes the participants read after an inline edit to the linked person", async () => {
  renderSection();
  fireEvent.click(screen.getByRole("button", { name: "Edit First name" }));
  fireEvent.change(screen.getByLabelText("editor-firstName"), { target: { value: "Pete" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(invalidateParticipants).toHaveBeenCalledWith({ dealId: "d1" }));
});

it("keeps the dialog open and reports the error when the switch is rejected", async () => {
  updateDealAction.mockResolvedValueOnce({ ok: false, error: { id: "E_DEAL_009" } });
  renderSection();
  await openMenu();
  await userEvent.click(await screen.findByRole("menuitem", { name: /switch to another person/i }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByLabelText("Person"));
  fireEvent.click(await screen.findByRole("option", { name: /Paul Burns/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_DEAL_009"));
  expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
});
