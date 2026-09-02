// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { DealParticipant } from "./participantsList";

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

const { orgPeopleQuery } = vi.hoisted(() => ({
  orgPeopleQuery: vi.fn(
    (
      _input: { orgId: string },
      opts?: { enabled?: boolean },
    ): { data: Array<{ id: string; name: string }> | undefined; isError?: boolean } => ({
      data:
        opts?.enabled === false
          ? undefined
          : [
              { id: "p1", name: "Peter Kuusisto" },
              { id: "p2", name: "Paul Burns" },
              { id: "p3", name: "Cara Colleague" },
            ],
    }),
  ),
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    contacts: {
      personOptions: {
        useQuery: () => ({
          data: [
            { id: "p1", name: "Peter Kuusisto" },
            { id: "p2", name: "Paul Burns" },
            { id: "p3", name: "Cara Colleague" },
            { id: "p9", name: "Zoe Outsider" },
          ],
          isError: false,
        }),
      },
      listPeopleForOrg: { useQuery: orgPeopleQuery },
    },
  },
}));

import { ParticipantsDialog } from "./ParticipantsDialog";

function participant(over: Partial<DealParticipant> & { personId: string }): DealParticipant {
  return {
    name: over.personId,
    isPrimary: false,
    isExplicit: true,
    orgName: null,
    primaryEmail: null,
    phone: null,
    ownerName: null,
    closedDeals: 0,
    openDeals: 0,
    nextActivityAt: null,
    ...over,
  };
}

const remove = vi.fn(() => Promise.resolve(null));

const LINKED = [
  participant({ personId: "p1", name: "Peter Kuusisto", isPrimary: true, isExplicit: false }),
  participant({ personId: "p2", name: "Paul Burns" }),
];

function renderDialog(orgId: string | null = "o1", participants: DealParticipant[] = LINKED) {
  return render(
    <ParticipantsDialog
      open
      onOpenChange={vi.fn()}
      title="Pioneer Valley Transit Authority"
      orgId={orgId}
      data={{
        participants,
        add: vi.fn(() => Promise.resolve(null)),
        remove,
        createAndAdd: vi.fn(() => Promise.resolve(null)),
      }}
    />,
  );
}

it("offers no remove control for the deal's own contact, only for added participants", () => {
  renderDialog();
  expect(screen.queryByRole("button", { name: "Remove Peter Kuusisto" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Remove Paul Burns" })).toBeInTheDocument();
});

it("keeps the remove control on a contact who is also explicitly linked", () => {
  renderDialog("o1", [
    participant({ personId: "p1", name: "Peter Kuusisto", isPrimary: true, isExplicit: true }),
  ]);
  expect(screen.getByRole("button", { name: "Remove Peter Kuusisto" })).toBeInTheDocument();
});

it("lists only the unlinked people of the active organization before any search text", () => {
  renderDialog();
  fireEvent.click(screen.getByLabelText("Link participant"));
  expect(screen.getByRole("button", { name: "Cara Colleague" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Paul Burns" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Zoe Outsider" })).not.toBeInTheDocument();
});

it("searches every visible person once the user types, not just the organization's", () => {
  renderDialog();
  const field = screen.getByLabelText("Link participant");
  fireEvent.click(field);
  fireEvent.change(field, { target: { value: "zoe" } });
  expect(screen.getByRole("button", { name: "Zoe Outsider" })).toBeInTheDocument();
});

it("falls back to every visible person when the deal has no organization", () => {
  renderDialog(null);
  fireEvent.click(screen.getByLabelText("Link participant"));
  expect(screen.getByRole("button", { name: "Zoe Outsider" })).toBeInTheDocument();
});

it("does not open on every person while the organization's people are still loading", () => {
  orgPeopleQuery.mockReturnValueOnce({ data: undefined });
  renderDialog();
  expect(screen.getByLabelText("Link participant")).toBeDisabled();
});

it("still links people when the organization lookup fails, using the full visible list", () => {
  orgPeopleQuery.mockReturnValueOnce({ data: undefined, isError: true });
  renderDialog();
  const field = screen.getByLabelText("Link participant");
  expect(field).toBeEnabled();
  fireEvent.click(field);
  expect(screen.getByRole("button", { name: "Zoe Outsider" })).toBeInTheDocument();
});

it("falls back to every visible person once the organization has nobody left to link", () => {
  renderDialog("o1", [...LINKED, participant({ personId: "p3", name: "Cara Colleague" })]);
  fireEvent.click(screen.getByLabelText("Link participant"));
  expect(screen.getByRole("button", { name: "Zoe Outsider" })).toBeInTheDocument();
});
