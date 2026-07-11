// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IDENTITY_ERROR_MESSAGES } from "@/constants/settingsIdentity";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const { setUserAdminAction, setUserActiveAction } = vi.hoisted(() => ({
  setUserAdminAction: vi.fn(() => Promise.resolve({ ok: false as const, error: "unauthorized" })),
  setUserActiveAction: vi.fn(() => Promise.resolve({ ok: true as const, value: true as const })),
}));
vi.mock("@/features/identity/actions/users", () => ({
  setUserAdminAction,
  setUserActiveAction,
}));

import { UserRowControls } from "./UserRowControls";

const PROPS = {
  userId: "11111111-1111-1111-1111-111111111111",
  isAdmin: false,
  isActive: true,
  onChanged: vi.fn(),
};

describe("UserRowControls", () => {
  it("shows an inline error when the admin toggle fails", async () => {
    render(<UserRowControls {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Make admin" }));
    await waitFor(() => expect(setUserAdminAction).toHaveBeenCalled());
    expect(await screen.findByText(IDENTITY_ERROR_MESSAGES.permission)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("clears the error and calls onChanged when a retry succeeds", async () => {
    // First admin toggle fails, then the active toggle (succeeds) clears the error.
    render(<UserRowControls {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Make admin" }));
    expect(await screen.findByText(IDENTITY_ERROR_MESSAGES.permission)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(PROPS.onChanged).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
