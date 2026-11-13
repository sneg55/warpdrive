// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TeamMailboxSettings } from "./TeamMailboxSettings";

const connect = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ ok: false, error: { id: "E_TEST_001" } }),
);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./teamMailboxActions", () => ({
  updateTeamMailboxAction: vi.fn(),
  setTeamMailboxMembersAction: vi.fn(),
  connectTeamMailboxStart: connect,
}));
vi.mock("./actions", () => ({ disconnectMailboxAction: vi.fn() }));
afterEach(cleanup);

const mailbox = {
  id: "team",
  email_address: "sales@example.com",
  display_name: "Sales",
  overdue_after_hours: 24,
  backfill_status: "failed",
  backfill_error_id: "E_GMAIL_002",
  backfill_days: 90,
  member_ids: [],
};

it("offers a reconnect for a disconnected team mailbox, signed in as that mailbox", async () => {
  render(<TeamMailboxSettings users={[]} mailboxes={[{ ...mailbox, status: "disconnected" }]} />);
  expect(screen.getByText(/Google disconnected this mailbox/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Reconnect" }));
  expect(connect).toHaveBeenCalledWith({ backfillDays: 90, loginHint: "sales@example.com" }, null);
});

it("shows no reconnect for a connected team mailbox", () => {
  render(<TeamMailboxSettings users={[]} mailboxes={[{ ...mailbox, status: "connected" }]} />);
  expect(screen.queryByRole("button", { name: "Reconnect" })).not.toBeInTheDocument();
});
