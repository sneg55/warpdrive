// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
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
    identity: {
      listUsers: { useQuery: () => ({ data: undefined }) },
      listVisibilityGroups: { useQuery: () => ({ data: undefined }) },
    },
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
    customFields: { listDefs: { useQuery: () => ({ data: [] }) } },
  },
}));

type IdResult = { ok: true; value: { id: string } } | { ok: false; error: { id: string } };
const STALE = new Error("Server Action was not found on the server");
const { createLeadAction, createPersonAction, createOrgAction } = vi.hoisted(() => ({
  createLeadAction: vi.fn<() => Promise<IdResult>>(),
  createPersonAction: vi.fn<() => Promise<IdResult>>(),
  createOrgAction: vi.fn<() => Promise<IdResult>>(),
}));
vi.mock("./leadServerActions", () => ({ createLeadAction }));
vi.mock("@/features/contacts/actions", () => ({ createPersonAction, createOrgAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  unstable_isUnrecognizedActionError: (e: unknown) => e === STALE,
}));

import { AddLeadModal } from "./AddLeadModal";

function renderFilledModal(onCreated = vi.fn()): void {
  render(<AddLeadModal baseCurrency="USD" onClose={vi.fn()} onCreated={onCreated} />);
  fireEvent.change(screen.getByLabelText("Contact person"), { target: { value: "Test User" } });
  fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Brand New Org" } });
  fireEvent.change(screen.getByLabelText("Lead title"), { target: { value: "Warm lead" } });
}

function contactsSucceed(): void {
  createOrgAction.mockResolvedValue({ ok: true, value: { id: "onew" } });
  createPersonAction.mockResolvedValue({ ok: true, value: { id: "pnew" } });
}

it("shows an unconfirmed error when the lead action rejects, and keeps the form re-submittable", async () => {
  contactsSucceed();
  createLeadAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  createLeadAction.mockResolvedValueOnce({ ok: true, value: { id: "l1" } });
  const onCreated = vi.fn();
  renderFilledModal(onCreated);

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("E_UI_003");
  expect(alert).toHaveTextContent(/could not confirm the lead was created/i);
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  expect(screen.getByLabelText("Lead title")).toHaveValue("Warm lead");

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  expect(createOrgAction).toHaveBeenCalledTimes(1);
  expect(createPersonAction).toHaveBeenCalledTimes(1);
});

it("asks for a reload when the lead action is missing from the running build", async () => {
  contactsSucceed();
  createLeadAction.mockRejectedValueOnce(STALE);
  renderFilledModal();

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("E_UI_002");
  expect(alert).toHaveTextContent(/reload the page/i);
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
});

it("shows an error when the inline organization create rejects, without creating the lead", async () => {
  createOrgAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  renderFilledModal();

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("E_UI_003");
  expect(alert).toHaveTextContent(/organization/i);
  expect(createLeadAction).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
});
