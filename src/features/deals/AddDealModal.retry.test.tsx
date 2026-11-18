// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    contacts: {
      personOptions: { useQuery: () => ({ data: [{ id: "pe1", name: "Jane Roe" }] }) },
      orgOptions: { useQuery: () => ({ data: [{ id: "or1", name: "Acme Inc" }] }) },
    },
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
    identity: {
      listUsers: { useQuery: () => ({ data: undefined }) },
      listVisibilityGroups: { useQuery: () => ({ data: undefined }) },
    },
    customFields: { listDefs: { useQuery: () => ({ data: [] }) } },
  },
}));

type DealResult =
  | { ok: true; deal: { id: string; updatedAt: string } }
  | { ok: false; error: { id: string } };
const { createDealAction, createPersonAction, createOrgAction } = vi.hoisted(() => ({
  createDealAction: vi.fn<() => Promise<DealResult>>(),
  createPersonAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "pnew" } })),
  createOrgAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "onew" } })),
}));
vi.mock("./createDealAction", () => ({ createDealAction }));
vi.mock("@/features/contacts/actions", () => ({ createPersonAction, createOrgAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import {
  INTERFACE_PREFS_DEFAULT,
  InterfacePrefsProvider,
} from "@/features/identity/InterfacePrefsProvider";
import { AddDealModal } from "./AddDealModal";

const PIPE = "11111111-1111-1111-1111-111111111111";
const STAGE = "22222222-2222-2222-2222-222222222222";

it("retrying Save after a failed deal create reuses the inline org and person", async () => {
  createDealAction.mockResolvedValueOnce({ ok: false, error: { id: "E_DB_001" } });
  createDealAction.mockResolvedValueOnce({ ok: true, deal: { id: "d1", updatedAt: "x" } });
  render(
    <InterfacePrefsProvider value={INTERFACE_PREFS_DEFAULT}>
      <QueryClientProvider client={new QueryClient()}>
        <AddDealModal
          pipelineId={PIPE}
          pipelines={[{ id: PIPE, name: "Sales", stages: [{ id: STAGE, name: "Qualified" }] }]}
          onClose={vi.fn()}
          onCreated={vi.fn()}
        />
      </QueryClientProvider>
    </InterfacePrefsProvider>,
  );
  fireEvent.change(screen.getByLabelText("Contact person"), { target: { value: "Test User" } });
  fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Brand New Org" } });

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("E_DB_001");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(createDealAction).toHaveBeenCalledTimes(2));
  expect(createOrgAction).toHaveBeenCalledTimes(1);
  expect(createPersonAction).toHaveBeenCalledTimes(1);
  expect(createDealAction).toHaveBeenLastCalledWith(
    expect.objectContaining({ orgId: "onew", personId: "pnew" }),
    "csrf",
  );
});
