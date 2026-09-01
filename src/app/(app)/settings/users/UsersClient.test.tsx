// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/settings/users",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { UsersClient } from "./UsersClient";

afterEach(() => {
  cleanup();
});

const SET_ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const ROWS = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Demo One",
    email: "demo1@example.com",
    isAdmin: true,
    isActive: true,
    invitedAt: null,
    permissionSetId: SET_ADMIN,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Demo Two",
    email: "demo2@example.com",
    isAdmin: false,
    isActive: true,
    invitedAt: null,
    permissionSetId: null,
  },
];

const SETS = [{ id: SET_ADMIN, name: "Admin set" }];

describe("UsersClient", () => {
  // The table is wider than the settings card at 1440px, so the action column was clipped
  // mid-word. The scroll container must be its own element: on the card itself, overflow-x-auto
  // sits next to the card's own overflow-hidden and which one wins is stylesheet-order luck.
  it("puts the table in a horizontal scroll container of its own", () => {
    render(<UsersClient rows={ROWS} permissionSets={SETS} viewerIsAdmin={true} />);
    const wrapper = screen.getByRole("table").parentElement;
    expect(wrapper).toHaveClass("overflow-x-auto");
    expect(wrapper).not.toHaveClass("overflow-hidden");
  });

  it("shows each user's current permission set", () => {
    render(<UsersClient rows={ROWS} permissionSets={SETS} viewerIsAdmin={true} />);
    expect(screen.getByRole("columnheader", { name: "Permission set" })).toBeInTheDocument();
    const [assigned, unassigned] = screen.getAllByRole("row").slice(1);
    expect(within(assigned as HTMLElement).getByText("Admin set")).toBeInTheDocument();
    expect(within(unassigned as HTMLElement).getByText("None")).toBeInTheDocument();
  });

  it("lets an admin viewer change an admin's set", async () => {
    const user = userEvent.setup();
    render(<UsersClient rows={ROWS} permissionSets={SETS} viewerIsAdmin={true} />);
    const [adminRow] = screen.getAllByRole("row").slice(1);
    await user.click(within(adminRow as HTMLElement).getByRole("button", { name: "User actions" }));
    expect(
      await screen.findByRole("menuitem", { name: "Change permission set" }),
    ).toBeInTheDocument();
  });

  it("denies a non-admin viewer the set submenu on an admin row", async () => {
    const user = userEvent.setup();
    render(<UsersClient rows={ROWS} permissionSets={SETS} viewerIsAdmin={false} />);
    const [adminRow, regularRow] = screen.getAllByRole("row").slice(1);
    await user.click(within(adminRow as HTMLElement).getByRole("button", { name: "User actions" }));
    await screen.findByRole("menu");
    expect(
      screen.queryByRole("menuitem", { name: "Change permission set" }),
    ).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(
      within(regularRow as HTMLElement).getByRole("button", { name: "User actions" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Change permission set" }),
    ).toBeInTheDocument();
  });
});
