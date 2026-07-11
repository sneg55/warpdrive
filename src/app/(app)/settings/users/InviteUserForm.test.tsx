// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";

// IDENTITY-02: with the action now returning a plain { error: { id } }, the form must render
// the SPECIFIC message for that id, not the generic "Something went wrong." fallback.
const { inviteUserAction } = vi.hoisted(() => ({ inviteUserAction: vi.fn() }));
vi.mock("@/features/identity/actions/invite", () => ({ inviteUserAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "tok" }));

import { InviteUserForm } from "./InviteUserForm";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function fillAndSubmit(): void {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "taken@example.com" } });
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Taken Person" } });
  fireEvent.click(screen.getByRole("button", { name: /invite/i }));
}

describe("InviteUserForm error mapping (IDENTITY-02)", () => {
  it("renders the duplicate-email message for AUTH_EMAIL_TAKEN", async () => {
    inviteUserAction.mockResolvedValueOnce({
      ok: false,
      error: { id: ERROR_IDS.AUTH_EMAIL_TAKEN },
    });
    render(<InviteUserForm onInvited={() => {}} />);
    fillAndSubmit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/already registered/i);
    expect(alert).not.toHaveTextContent(/something went wrong/i);
  });

  it("renders the permission message for PERM_DENIED", async () => {
    inviteUserAction.mockResolvedValueOnce({ ok: false, error: { id: ERROR_IDS.PERM_DENIED } });
    render(<InviteUserForm onInvited={() => {}} />);
    fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have permission/i);
  });

  it("calls onInvited and shows no error on success", async () => {
    inviteUserAction.mockResolvedValueOnce({ ok: true, userId: "u-1" });
    const onInvited = vi.fn();
    render(<InviteUserForm onInvited={onInvited} />);
    fillAndSubmit();

    await vi.waitFor(() => expect(onInvited).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("InviteUserForm link invite (no email is sent)", () => {
  it("after a successful invite, states no email is sent and offers a shareable sign-in link", async () => {
    inviteUserAction.mockResolvedValueOnce({ ok: true, userId: "u-9" });
    render(<InviteUserForm onInvited={() => {}} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New Person" } });
    fireEvent.click(screen.getByRole("button", { name: /invite/i }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/no email/i);
    expect(status).toHaveTextContent(/new@example.com/);
    // A shareable sign-in link is shown (the login URL, since access is Google SSO).
    const link = screen.getByRole("textbox", { name: /invite link/i });
    expect((link as HTMLInputElement).value).toContain("/login");
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
  });

  it("copies the sign-in link to the clipboard", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    inviteUserAction.mockResolvedValueOnce({ ok: true, userId: "u-9" });
    render(<InviteUserForm onInvited={() => {}} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New Person" } });
    fireEvent.click(screen.getByRole("button", { name: /invite/i }));

    await screen.findByRole("status");
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0]?.[0]).toContain("/login");
  });
});
