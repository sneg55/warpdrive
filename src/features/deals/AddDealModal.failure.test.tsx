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
      personOptions: { useQuery: () => ({ data: [] }) },
      orgOptions: { useQuery: () => ({ data: [] }) },
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
type ContactResult = { ok: true; value: { id: string } } | { ok: false; error: { id: string } };
const STALE = new Error("Server Action was not found on the server");
const { createDealAction, createPersonAction, createOrgAction } = vi.hoisted(() => ({
  createDealAction: vi.fn<() => Promise<DealResult>>(),
  createPersonAction: vi.fn<() => Promise<ContactResult>>(),
  createOrgAction: vi.fn<() => Promise<ContactResult>>(),
}));
vi.mock("./createDealAction", () => ({ createDealAction }));
vi.mock("@/features/contacts/actions", () => ({ createPersonAction, createOrgAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  unstable_isUnrecognizedActionError: (e: unknown) => e === STALE,
}));

import {
  INTERFACE_PREFS_DEFAULT,
  InterfacePrefsProvider,
} from "@/features/identity/InterfacePrefsProvider";
import { AddDealModal } from "./AddDealModal";

const PIPE = "11111111-1111-1111-1111-111111111111";
const STAGE = "22222222-2222-2222-2222-222222222222";

function renderFilledModal(onCreated = vi.fn()): void {
  render(
    <InterfacePrefsProvider value={INTERFACE_PREFS_DEFAULT}>
      <QueryClientProvider client={new QueryClient()}>
        <AddDealModal
          baseCurrency="USD"
          pipelineId={PIPE}
          pipelines={[{ id: PIPE, name: "Sales", stages: [{ id: STAGE, name: "Qualified" }] }]}
          onClose={vi.fn()}
          onCreated={onCreated}
        />
      </QueryClientProvider>
    </InterfacePrefsProvider>,
  );
  fireEvent.change(screen.getByLabelText("Contact person"), { target: { value: "Test User" } });
  fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Brand New Org" } });
  fireEvent.change(screen.getByLabelText("Deal title"), { target: { value: "Big deal" } });
}

function contactsSucceed(): void {
  createOrgAction.mockResolvedValue({ ok: true, value: { id: "onew" } });
  createPersonAction.mockResolvedValue({ ok: true, value: { id: "pnew" } });
}

it("shows an unconfirmed error when the deal action rejects, and keeps the form re-submittable", async () => {
  contactsSucceed();
  createDealAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  createDealAction.mockResolvedValueOnce({ ok: true, deal: { id: "d1", updatedAt: "x" } });
  const onCreated = vi.fn();
  renderFilledModal(onCreated);

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("E_UI_003");
  expect(alert).toHaveTextContent(/could not confirm the deal was created/i);
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  expect(screen.getByLabelText("Deal title")).toHaveValue("Big deal");

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith("d1", "Big deal"));
  expect(createOrgAction).toHaveBeenCalledTimes(1);
  expect(createPersonAction).toHaveBeenCalledTimes(1);
});

it("asks for a reload when the deal action is missing from the running build", async () => {
  contactsSucceed();
  createDealAction.mockRejectedValueOnce(STALE);
  renderFilledModal();

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("E_UI_002");
  expect(alert).toHaveTextContent(/reload the page/i);
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
});

it("shows an error when the inline organization create rejects, without creating the deal", async () => {
  createOrgAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  renderFilledModal();

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("E_UI_003");
  expect(alert).toHaveTextContent(/organization/i);
  expect(createDealAction).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
});

it("shows an error when the inline person create rejects, without creating the deal", async () => {
  createOrgAction.mockResolvedValue({ ok: true, value: { id: "onew" } });
  createPersonAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  renderFilledModal();

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("E_UI_003");
  expect(alert).toHaveTextContent(/person/i);
  expect(createDealAction).not.toHaveBeenCalled();
});
