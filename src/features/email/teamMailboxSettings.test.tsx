// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { TeamMailboxSettings } from "./TeamMailboxSettings";

const update = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./teamMailboxActions", () => ({
  updateTeamMailboxAction: update,
  setTeamMailboxMembersAction: vi.fn().mockResolvedValue({ ok: true }),
  connectTeamMailboxStart: vi.fn(),
}));
vi.mock("./actions", () => ({ disconnectMailboxAction: vi.fn() }));

it("shows import status and design-system controls and saves team settings", async () => {
  render(
    <TeamMailboxSettings
      users={[{ id: "member", name: "Sam" }]}
      mailboxes={[
        {
          id: "team",
          email_address: "sales@example.com",
          display_name: "Sales",
          status: "connected",
          overdue_after_hours: 24,
          backfill_status: "failed",
          backfill_error_id: "E_GMAIL_001",
          backfill_days: 90,
          member_ids: ["member"],
        },
      ]}
    />,
  );
  expect(screen.getByRole("button", { name: "Connect team mailbox" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Import history" })).toBeInTheDocument();
  expect(screen.getByText(/E_GMAIL_001/)).toBeInTheDocument();
  const input = screen.getByRole("textbox", { name: "Display name" });
  await userEvent.clear(input);
  await userEvent.type(input, "Partners");
  await userEvent.click(screen.getByRole("button", { name: "Save mailbox" }));
  expect(update).toHaveBeenCalledWith(
    { accountId: "team", displayName: "Partners", overdueAfterHours: 24 },
    null,
  );
});
