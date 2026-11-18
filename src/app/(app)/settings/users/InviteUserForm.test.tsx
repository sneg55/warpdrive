// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";

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

describe("InviteUserForm inline validation", () => {
  it("opts out of native browser validation", () => {
    const { container } = render(<InviteUserForm onInvited={() => {}} />);
    expect(container.querySelector("form")).toHaveAttribute("novalidate");
  });

  it("shows an inline error for a malformed email and does not call the action", async () => {
    render(<InviteUserForm onInvited={() => {}} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "nope" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "No Pe" } });
    fireEvent.click(screen.getByRole("button", { name: /invite/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/valid email address/i);
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(inviteUserAction).not.toHaveBeenCalled();
  });

  it("shows an inline error when a field is empty", async () => {
    render(<InviteUserForm onInvited={() => {}} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /invite/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/name/i);
    expect(inviteUserAction).not.toHaveBeenCalled();
  });

  it("clears the inline error once the email is corrected", async () => {
    inviteUserAction.mockResolvedValueOnce({ ok: true, userId: "u-1" });
    render(<InviteUserForm onInvited={() => {}} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "nope" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "No Pe" } });
    fireEvent.click(screen.getByRole("button", { name: /invite/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ok@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /invite/i }));
    await vi.waitFor(() => expect(inviteUserAction).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

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

  it("shows Copy failed when the browser denies the clipboard write", async () => {
    const denied = new DOMException("Write permission denied.", "NotAllowedError");
    Object.assign(navigator, { clipboard: { writeText: () => Promise.reject(denied) } });
    inviteUserAction.mockResolvedValueOnce({ ok: true, userId: "u-9" });
    render(<InviteUserForm onInvited={() => {}} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New Person" } });
    fireEvent.click(screen.getByRole("button", { name: /invite/i }));

    await screen.findByRole("status");
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(await screen.findByRole("button", { name: "Copy failed" })).toBeInTheDocument();
  });
});
