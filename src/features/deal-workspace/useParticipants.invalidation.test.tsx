// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const { invalidatePersonOptions, invalidatePeopleForOrg, invalidateParticipants } = vi.hoisted(
  () => ({
    invalidatePersonOptions: vi.fn(),
    invalidatePeopleForOrg: vi.fn(),
    invalidateParticipants: vi.fn(),
  }),
);
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      deal: { participants: { invalidate: invalidateParticipants } },
      contacts: {
        personOptions: { invalidate: invalidatePersonOptions },
        listPeopleForOrg: { invalidate: invalidatePeopleForOrg },
      },
    }),
    deal: { participants: { useQuery: () => ({ data: [] }) } },
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/features/contacts/actions", () => ({
  createPersonAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "pnew" } })),
}));
vi.mock("./actions", () => ({
  addParticipantAction: vi.fn(() => Promise.resolve({ ok: true as const })),
  removeParticipantAction: vi.fn(() => Promise.resolve({ ok: true as const })),
}));

import { useParticipants } from "./useParticipants";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Harness({ orgId }: { orgId: string | null }) {
  const { createAndAdd } = useParticipants("d1", orgId);
  return (
    <button type="button" onClick={() => void createAndAdd("Dana Whitfield")}>
      create
    </button>
  );
}

it("refreshes the organization's people after creating and linking one of them", async () => {
  render(<Harness orgId="o1" />);
  await userEvent.click(screen.getByRole("button", { name: "create" }));
  await waitFor(() => expect(invalidatePersonOptions).toHaveBeenCalled());
  expect(invalidatePeopleForOrg).toHaveBeenCalledWith({ orgId: "o1" });
});

it("skips the organization refresh when the deal has no organization", async () => {
  render(<Harness orgId={null} />);
  await userEvent.click(screen.getByRole("button", { name: "create" }));
  await waitFor(() => expect(invalidatePersonOptions).toHaveBeenCalled());
  expect(invalidatePeopleForOrg).not.toHaveBeenCalled();
});
