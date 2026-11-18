// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TeamMailboxSettings } from "./TeamMailboxSettings";

const reconnect = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, value: {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./teamMailboxActions", () => ({
  updateTeamMailboxAction: vi.fn(),
  setTeamMailboxMembersAction: vi.fn(),
  connectTeamMailboxStart: vi.fn(),
}));
vi.mock("./actions", () => ({ disconnectMailboxAction: vi.fn() }));
vi.mock("./agenticConnect", () => ({
  connectAgenticInbox: vi.fn(),
  reconnectAgenticInbox: reconnect,
}));
afterEach(cleanup);

const mailbox = {
  id: "agentic",
  email_address: "media@example.com",
  display_name: "Media",
  overdue_after_hours: 24,
  backfill_status: "done",
  backfill_error_id: null,
  last_error_id: null,
  backfill_days: 90,
  member_ids: [],
  status: "error",
  provider: "agentic_inbox" as const,
};

it("shows the connect button only when the flag is passed down", () => {
  const { rerender } = render(
    <TeamMailboxSettings users={[]} mailboxes={[]} agenticEnabled={false} />,
  );
  expect(screen.queryByRole("button", { name: "Connect agentic inbox" })).not.toBeInTheDocument();
  rerender(<TeamMailboxSettings users={[]} mailboxes={[]} agenticEnabled />);
  expect(screen.getByRole("button", { name: "Connect agentic inbox" })).toBeInTheDocument();
});

it("labels an agentic mailbox and reconnects it with only client id and secret", async () => {
  render(<TeamMailboxSettings users={[]} mailboxes={[mailbox]} agenticEnabled />);
  expect(screen.getByText("Agentic inbox")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Reconnect" }));
  expect(screen.queryByLabelText("Base URL")).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Client ID"), "cid");
  await userEvent.type(screen.getByLabelText("Client secret"), "secret");
  await userEvent.click(screen.getAllByRole("button", { name: "Reconnect" }).at(-1) as HTMLElement);
  expect(reconnect).toHaveBeenCalledWith(null, {
    accountId: "agentic",
    clientId: "cid",
    clientSecret: "secret",
  });
});

it("hides the agentic reconnect while the flag is off but still lists the mailbox", () => {
  render(<TeamMailboxSettings users={[]} mailboxes={[mailbox]} agenticEnabled={false} />);
  expect(screen.getByText("Agentic inbox")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reconnect" })).not.toBeInTheDocument();
});

it("does not say Google disconnected an agentic mailbox", () => {
  render(
    <TeamMailboxSettings
      users={[]}
      mailboxes={[{ ...mailbox, status: "disconnected" }]}
      agenticEnabled
    />,
  );
  expect(screen.queryByText(/Google disconnected/)).not.toBeInTheDocument();
});

it("a connected agentic mailbox can still be reconnected when the flag is on", () => {
  render(
    <TeamMailboxSettings
      users={[]}
      mailboxes={[{ ...mailbox, status: "connected", last_error_id: "E_AINBOX_001" }]}
      agenticEnabled
    />,
  );
  expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
});

it("an agentic mailbox whose token was rejected says so and asks for a reconnect", () => {
  render(
    <TeamMailboxSettings
      users={[]}
      mailboxes={[{ ...mailbox, status: "connected", last_error_id: "E_AINBOX_001" }]}
      agenticEnabled
    />,
  );
  expect(screen.getByText(/access token was rejected/i)).toHaveTextContent(/reconnect/i);
});

it("an agentic mailbox with no stored error shows no error line", () => {
  render(
    <TeamMailboxSettings
      users={[]}
      mailboxes={[{ ...mailbox, status: "connected", last_error_id: null }]}
      agenticEnabled
    />,
  );
  expect(screen.queryByText(/access token was rejected/i)).not.toBeInTheDocument();
});

it("an agentic mailbox error without its own copy does not read as a failed connect", () => {
  render(
    <TeamMailboxSettings
      users={[]}
      mailboxes={[{ ...mailbox, status: "connected", last_error_id: "E_AINBOX_010" }]}
      agenticEnabled
    />,
  );
  expect(screen.queryByText(/Connecting failed/)).not.toBeInTheDocument();
  expect(screen.getByText(/E_AINBOX_010/)).toBeInTheDocument();
});
