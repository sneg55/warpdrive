// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const connectGmailStart = vi.fn();
const disconnectMailboxAction = vi.fn();
const refresh = vi.fn();

vi.mock("@/features/email/actions", () => ({
  connectGmailStart: () => connectGmailStart(),
  disconnectMailboxAction: (csrf: string | null, input: unknown) =>
    disconnectMailboxAction(csrf, input),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf-token" }));

import { EmailSyncClient, type MailboxView } from "./EmailSyncClient";

const originalLocation = window.location;

const connected: MailboxView = {
  id: "acc-1",
  emailAddress: "rep@example.com",
  status: "connected",
  lastSyncAtIso: "2026-07-01T10:00:00.000Z",
  lastErrorId: null,
};

beforeEach(() => {
  connectGmailStart.mockReset();
  disconnectMailboxAction.mockReset();
  refresh.mockReset();
  Object.defineProperty(window, "location", { configurable: true, value: { href: "" } });
});
afterEach(() => {
  cleanup();
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

describe("EmailSyncClient", () => {
  it("shows Connect when no mailbox is linked and redirects to the consent URL", async () => {
    connectGmailStart.mockResolvedValue({
      url: "https://accounts.google.com/o/oauth2/v2/auth?x=1",
    });
    render(<EmailSyncClient mailbox={null} />);
    expect(screen.getByText("No mailbox is connected yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Connect Gmail" }));
    await waitFor(() =>
      expect(window.location.href).toBe("https://accounts.google.com/o/oauth2/v2/auth?x=1"),
    );
    expect(connectGmailStart).toHaveBeenCalledTimes(1);
  });

  it("shows the connected address, last sync, and a Disconnect button when connected", () => {
    render(<EmailSyncClient mailbox={connected} />);
    expect(screen.getByText("Connected as rep@example.com")).toBeInTheDocument();
    expect(screen.getByText(/Last synced/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
  });

  it("Disconnect calls the action with csrf + account id then refreshes", async () => {
    disconnectMailboxAction.mockResolvedValue({ ok: true, value: { disconnected: true } });
    render(<EmailSyncClient mailbox={connected} />);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() =>
      expect(disconnectMailboxAction).toHaveBeenCalledWith("csrf-token", { accountId: "acc-1" }),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows Reconnect and the last error for a disconnected mailbox", () => {
    render(
      <EmailSyncClient
        mailbox={{ ...connected, status: "disconnected", lastErrorId: "E_GMAIL_002" }}
      />,
    );
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
    expect(screen.getByText(/E_GMAIL_002/)).toBeInTheDocument();
  });
});
