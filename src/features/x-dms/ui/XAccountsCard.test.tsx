// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { XAccountSettings } from "../accountAdmin";
import { XAccountsCard } from "./XAccountsCard";

afterEach(cleanup);

const disconnect = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
const connect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const removeKeys = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
vi.mock("../chatKeyActions", () => ({
  unlockChatKeysAction: vi.fn(),
  removeChatKeysAction: removeKeys,
}));
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
  chatKeyState: "locked",
  chatKeysUnlockedAt: null,
  chatKeysUnlockedByName: null,
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

it("locked shows its line and an Unlock button that opens the dialog", async () => {
  render(<XAccountsCard enabled accounts={[account]} users={users} />);
  expect(screen.getByText("Encrypted messages: locked")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Remove keys" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
  expect(screen.getByLabelText("Passcode")).toHaveAttribute("type", "password");
});

it("unlocked shows who and when, with Remove keys behind a confirm", async () => {
  const unlockedAt = new Date("2026-11-10T10:00:00Z");
  render(
    <XAccountsCard
      enabled
      accounts={[
        {
          ...account,
          chatKeyState: "unlocked",
          chatKeysUnlockedAt: unlockedAt,
          chatKeysUnlockedByName: "Sam",
        },
      ]}
      users={users}
    />,
  );
  expect(
    screen.getByText(`Encrypted messages: unlocked by Sam, ${unlockedAt.toLocaleDateString()}`),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Remove keys" }));
  expect(screen.getByText("Remove encrypted message keys?")).toBeInTheDocument();
  expect(
    screen.getByText(
      "Encrypted messages that arrive from now on will not be readable and replies will stop until an admin unlocks again. Messages already shown stay visible.",
    ),
  ).toBeInTheDocument();
  expect(removeKeys).not.toHaveBeenCalled();
  const buttons = screen.getAllByRole("button", { name: "Remove keys" });
  await userEvent.click(buttons[buttons.length - 1] as HTMLElement);
  expect(removeKeys).toHaveBeenCalledWith({ accountId: "acc" }, null);
});

it("stale shows its line and Unlock again", () => {
  render(
    <XAccountsCard enabled accounts={[{ ...account, chatKeyState: "stale" }]} users={users} />,
  );
  expect(screen.getByText("Encrypted messages: need unlocking again")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Unlock again" })).toBeInTheDocument();
});

it("unlocked without a name falls back to the date alone", () => {
  render(
    <XAccountsCard
      enabled
      accounts={[
        {
          ...account,
          chatKeyState: "unlocked",
          chatKeysUnlockedAt: new Date("2026-11-10T10:00:00Z"),
          chatKeysUnlockedByName: null,
        },
      ]}
      users={users}
    />,
  );
  expect(screen.getByText(/^Encrypted messages: unlocked, /)).toBeInTheDocument();
});

const unlockedAccount: XAccountSettings = {
  ...account,
  chatKeyState: "unlocked",
  chatKeysUnlockedAt: new Date("2026-11-10T10:00:00Z"),
  chatKeysUnlockedByName: "Sam",
};

async function confirmRemove(): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: "Remove keys" }));
  const buttons = screen.getAllByRole("button", { name: "Remove keys" });
  await userEvent.click(buttons[buttons.length - 1] as HTMLElement);
}

it("shows a failure when remove keys rejects", async () => {
  removeKeys.mockRejectedValueOnce(new Error("network"));
  render(<XAccountsCard enabled accounts={[unlockedAccount]} users={users} />);
  await confirmRemove();
  expect(await screen.findByText("Could not remove the keys. Try again.")).toBeInTheDocument();
});

it("clears the remove error after a later success", async () => {
  removeKeys.mockResolvedValueOnce({ ok: false, error: { id: "E_X_015" } });
  render(<XAccountsCard enabled accounts={[unlockedAccount]} users={users} />);
  await confirmRemove();
  expect(await screen.findByText(/E_X_015/)).toBeInTheDocument();
  removeKeys.mockResolvedValueOnce({ ok: true });
  await confirmRemove();
  await waitFor(() => expect(screen.queryByText(/E_X_015/)).not.toBeInTheDocument());
});
