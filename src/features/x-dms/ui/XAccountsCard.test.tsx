// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { XAccountSettings } from "../accountAdmin";
import { XAccountsCard } from "./XAccountsCard";

afterEach(cleanup);

const disconnect = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
const connect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions", () => ({
  connectXAccountStart: connect,
  updateXAccountAction: vi.fn().mockResolvedValue({ ok: true }),
  setXAccountMembersAction: vi.fn().mockResolvedValue({ ok: true }),
  disconnectXAccountAction: disconnect,
}));

const account: XAccountSettings = {
  id: "acc",
  displayName: "Brand",
  username: "brand",
  status: "reconnect_required",
  memberIds: ["member"],
  lastSyncAt: null,
  lastErrorId: "E_X_010",
  overdueAfterHours: 24,
};
const users = [{ id: "member", name: "Sam" }];

it("renders nothing when disabled", () => {
  const { container } = render(
    <XAccountsCard enabled={false} accounts={[account]} users={users} />,
  );
  expect(container).toBeEmptyDOMElement();
});

it("reconnect_required shows the error id and a Reconnect button", async () => {
  render(<XAccountsCard enabled accounts={[account]} users={users} />);
  expect(screen.getByText(/E_X_010/)).toBeInTheDocument();
  expect(screen.getByText("@brand")).toBeInTheDocument();
  connect.mockResolvedValue({ ok: true, value: { url: "about:blank" } });
  await userEvent.click(screen.getByRole("button", { name: "Reconnect" }));
  expect(connect).toHaveBeenCalled();
});

it("disconnect asks for confirmation", async () => {
  render(<XAccountsCard enabled accounts={[account]} users={users} />);
  await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));
  expect(disconnect).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Disconnect X account" }));
  expect(disconnect).toHaveBeenCalledWith({ accountId: "acc" }, null);
});

it("status line says Reconnect required or Connected and counts members", () => {
  const view = render(<XAccountsCard enabled accounts={[account]} users={users} />);
  expect(screen.getByText(/^Reconnect required, 1 member, last sync never$/)).toBeInTheDocument();
  view.rerender(
    <XAccountsCard
      enabled
      accounts={[{ ...account, status: "connected", memberIds: ["a", "b"], lastErrorId: null }]}
      users={users}
    />,
  );
  expect(screen.getByText(/^Connected, 2 members, last sync never$/)).toBeInTheDocument();
});
