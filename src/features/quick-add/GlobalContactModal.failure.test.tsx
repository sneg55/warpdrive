// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

type IdResult = { ok: true; value: { id: string } } | { ok: false; error: { id: string } };
const STALE = new Error("Server Action was not found on the server");
const { createPersonAction, createOrgAction } = vi.hoisted(() => ({
  createPersonAction: vi.fn<() => Promise<IdResult>>(),
  createOrgAction: vi.fn<() => Promise<IdResult>>(),
}));
vi.mock("@/features/contacts/actions", () => ({ createPersonAction, createOrgAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "tok" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  unstable_isUnrecognizedActionError: (e: unknown) => e === STALE,
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    contacts: { orgOptions: { useQuery: () => ({ data: [] }) } },
    customFields: { listDefs: { useQuery: () => ({ data: [], isLoading: false }) } },
  },
}));

import { GlobalContactModal } from "./GlobalContactModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("shows an unconfirmed error when the person action rejects, and keeps the form re-submittable", async () => {
  createPersonAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  createPersonAction.mockResolvedValueOnce({ ok: true, value: { id: "p1" } });
  const onCreated = vi.fn();
  render(<GlobalContactModal kind="person" onClose={vi.fn()} onCreated={onCreated} />);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ada Lovelace" } });

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("E_UI_003");
  expect(alert).toHaveTextContent(/could not confirm the person was created/i);
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace");

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith("p1"));
});

it("asks for a reload when the organization action is missing from the running build", async () => {
  createOrgAction.mockRejectedValueOnce(STALE);
  render(<GlobalContactModal kind="org" onClose={vi.fn()} onCreated={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Acme" } });

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("E_UI_002");
  expect(alert).toHaveTextContent(/reload the page/i);
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
});

it("names the failed create instead of showing a bare error id", async () => {
  createOrgAction.mockResolvedValueOnce({ ok: false, error: { id: "E_DB_003" } });
  render(<GlobalContactModal kind="org" onClose={vi.fn()} onCreated={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Acme" } });

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not create organization (E_DB_003)",
  );
});
