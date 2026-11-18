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
      personOptions: { useQuery: () => ({ data: [{ id: "pe1", name: "Jane Roe" }] }) },
      orgOptions: { useQuery: () => ({ data: [{ id: "or1", name: "Acme Inc" }] }) },
    },
    identity: {
      listUsers: { useQuery: () => ({ data: undefined }) },
      listVisibilityGroups: { useQuery: () => ({ data: undefined }) },
    },
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
    customFields: { listDefs: { useQuery: () => ({ data: [] }) } },
  },
}));

type LeadResult = { ok: true; value: { id: string } } | { ok: false; error: { id: string } };
const { createLeadAction, createPersonAction, createOrgAction } = vi.hoisted(() => ({
  createLeadAction: vi.fn<() => Promise<LeadResult>>(),
  createPersonAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "pnew" } })),
  createOrgAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "onew" } })),
}));
vi.mock("./leadServerActions", () => ({ createLeadAction }));
vi.mock("@/features/contacts/actions", () => ({ createPersonAction, createOrgAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { AddLeadModal } from "./AddLeadModal";

it("retrying Save after a failed lead create reuses the inline org and person", async () => {
  createLeadAction.mockResolvedValueOnce({ ok: false, error: { id: "E_DB_001" } });
  createLeadAction.mockResolvedValueOnce({ ok: true, value: { id: "l1" } });
  render(<AddLeadModal onClose={vi.fn()} onCreated={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Contact person"), { target: { value: "Test User" } });
  fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Brand New Org" } });

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("E_DB_001");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(createLeadAction).toHaveBeenCalledTimes(2));
  expect(createOrgAction).toHaveBeenCalledTimes(1);
  expect(createPersonAction).toHaveBeenCalledTimes(1);
  expect(createLeadAction).toHaveBeenLastCalledWith(
    expect.objectContaining({ orgId: "onew", personId: "pnew" }),
    "csrf",
  );
});
