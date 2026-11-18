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
    useUtils: () => ({
      activities: {
        dayLoad: { invalidate: () => Promise.resolve() },
        listRows: { invalidate: () => Promise.resolve() },
      },
    }),
    activities: {
      listTypes: { useQuery: () => ({ data: [{ id: "t1", key: "call", name: "Call" }] }) },
      dayLoad: { useQuery: () => ({ data: undefined }) },
    },
    contacts: {
      listPeople: { useQuery: () => ({ data: { rows: [], total: 0 } }) },
      listOrgs: { useQuery: () => ({ data: { rows: [], total: 0 } }) },
    },
  },
}));

type IdResult = { ok: true; value: { id: string } } | { ok: false; error: { id: string } };
const STALE = new Error("Server Action was not found on the server");
const { createActivityAction } = vi.hoisted(() => ({
  createActivityAction: vi.fn<() => Promise<IdResult>>(),
}));
vi.mock("./actions", () => ({ createActivityAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("next/navigation", () => ({
  unstable_isUnrecognizedActionError: (e: unknown) => e === STALE,
}));

import { AddActivityModal } from "./AddActivityModal";

function renderFilled(onCreated = vi.fn()): void {
  render(<AddActivityModal onClose={vi.fn()} onCreated={onCreated} />);
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Call Ann" } });
}

it("shows an unconfirmed error when the action rejects, and the retry succeeds", async () => {
  createActivityAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  createActivityAction.mockResolvedValueOnce({ ok: true, value: { id: "a1" } });
  const onCreated = vi.fn();
  renderFilled(onCreated);

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("E_UI_003");
  expect(alert).toHaveTextContent(/could not confirm the activity was created/i);
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  expect(screen.getByLabelText("Subject")).toHaveValue("Call Ann");

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
});

it("asks for a reload when the action is missing from the running build", async () => {
  createActivityAction.mockRejectedValueOnce(STALE);
  renderFilled();

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("E_UI_002");
  expect(alert).toHaveTextContent(/reload the page/i);
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
});

it("shows the returned error id and keeps the typed subject", async () => {
  createActivityAction.mockResolvedValueOnce({ ok: false, error: { id: "E_DB_003" } });
  renderFilled();

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Could not create activity (E_DB_003)");
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  expect(screen.getByLabelText("Subject")).toHaveValue("Call Ann");
});
