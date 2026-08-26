// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { IDENTITY_ERROR_MESSAGES } from "@/constants/settingsIdentity";

// Radix DropdownMenu relies on pointer-capture + scrollIntoView, which jsdom lacks.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

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

type User = ReturnType<typeof userEvent.setup>;

async function openMenu(user: User): Promise<void> {
  await user.click(screen.getByRole("button", { name: "User actions" }));
  await screen.findByRole("menu");
}

async function chooseAction(user: User, name: string): Promise<void> {
  await openMenu(user);
  const item = screen.getByRole("menuitem", { name });
  await waitFor(() => expect(item).not.toHaveAttribute("data-disabled"));
  await user.click(item);
}

describe("UserRowControls", () => {
  // At 1440px the two inline buttons overflowed the settings card and rendered as "Deacti...".
  // One overflow menu keeps the row inside the card at every width.
  it("collapses both actions into a single row overflow menu", async () => {
    const user = userEvent.setup();
    const { container } = render(<UserRowControls {...PROPS} />);
    expect(within(container).getAllByRole("button")).toHaveLength(1);

    await openMenu(user);
    expect(screen.getByRole("menuitem", { name: "Make admin" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Deactivate" })).toBeInTheDocument();
  });

  it("shows an inline error when the admin toggle fails", async () => {
    const user = userEvent.setup();
    render(<UserRowControls {...PROPS} />);
    await chooseAction(user, "Make admin");
    await waitFor(() => expect(setUserAdminAction).toHaveBeenCalled());
    expect(await screen.findByText(IDENTITY_ERROR_MESSAGES.permission)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("clears the error and calls onChanged when a retry succeeds", async () => {
    // First admin toggle fails, then the active toggle (succeeds) clears the error.
    const user = userEvent.setup();
    render(<UserRowControls {...PROPS} />);
    await chooseAction(user, "Make admin");
    expect(await screen.findByText(IDENTITY_ERROR_MESSAGES.permission)).toBeInTheDocument();
    await chooseAction(user, "Deactivate");
    await waitFor(() => expect(PROPS.onChanged).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
