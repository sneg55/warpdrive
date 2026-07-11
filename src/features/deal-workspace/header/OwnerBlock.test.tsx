// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const changeOwnerAction = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ ok: true as const, deal: { id: "d1", updatedAt: "x" } })),
);
vi.mock("@/features/deal-workspace/actions", () => ({ changeOwnerAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
const reportError = vi.fn();
vi.mock("@/features/deal-workspace/DealActionErrorProvider", () => ({
  useDealActionError: () => reportError,
}));

import { OwnerBlock } from "./OwnerBlock";

afterEach(() => {
  cleanup();
  changeOwnerAction.mockClear();
  reportError.mockClear();
});

const owner = { id: "u1", name: "Ada Lovelace", avatarUrl: null };
const props = {
  dealId: "d1",
  expectedUpdatedAt: "2026-07-02T00:00:00.000Z",
  owner,
  canChangeOwner: true,
  assignableUsers: [
    { id: "u1", name: "Ada Lovelace" },
    { id: "u2", name: "Alan Turing" },
  ],
};

it("renders the owner avatar, name, and Owner caption", () => {
  render(<OwnerBlock {...props} />);
  expect(screen.getByText("Ada Lovelace")).toBeTruthy();
  expect(screen.getByText("Owner")).toBeTruthy();
  expect(screen.getByRole("img", { name: "Ada Lovelace" })).toBeTruthy();
});

it("humanizes an email-shaped owner name instead of rendering the raw email", () => {
  render(
    <OwnerBlock {...props} owner={{ id: "u9", name: "demo2@example.com", avatarUrl: null }} />,
  );
  expect(screen.queryByText("demo2@example.com")).toBeNull();
  expect(screen.getByText("Demo2")).toBeTruthy();
});

it("falls back to Unassigned (not an empty name) when the owner name is empty", () => {
  render(<OwnerBlock {...props} owner={{ id: "u9", name: "", avatarUrl: null }} />);
  expect(screen.getByText("Unassigned")).toBeTruthy();
});

it("hides the reassignment trigger when the actor cannot change owner", () => {
  render(<OwnerBlock {...props} canChangeOwner={false} />);
  expect(screen.queryByRole("button", { name: "Change owner" })).toBeNull();
});

it("selecting a different user calls changeOwnerAction", async () => {
  const user = userEvent.setup();
  render(<OwnerBlock {...props} />);
  await user.click(screen.getByRole("button", { name: "Change owner" }));
  await user.click(screen.getByRole("menuitem", { name: "Alan Turing" }));
  expect(changeOwnerAction).toHaveBeenCalledWith(
    { dealId: "d1", ownerId: "u2", expectedUpdatedAt: props.expectedUpdatedAt },
    "csrf",
  );
});

it("surfaces the shared error when the reassignment is denied (no silent swallow)", async () => {
  changeOwnerAction.mockResolvedValueOnce({
    ok: false as const,
    error: { id: "E_PERM_001" },
  } as never);
  const user = userEvent.setup();
  render(<OwnerBlock {...props} />);
  await user.click(screen.getByRole("button", { name: "Change owner" }));
  await user.click(screen.getByRole("menuitem", { name: "Alan Turing" }));
  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
});
