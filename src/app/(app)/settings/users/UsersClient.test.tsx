// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

const ROWS = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Demo One",
    email: "demo1@example.com",
    isAdmin: true,
    isActive: true,
    invitedAt: null,
  },
];

describe("UsersClient", () => {
  // The table is wider than the settings card at 1440px, so the action column was clipped
  // mid-word. The scroll container must be its own element: on the card itself, overflow-x-auto
  // sits next to the card's own overflow-hidden and which one wins is stylesheet-order luck.
  it("puts the table in a horizontal scroll container of its own", () => {
    render(<UsersClient rows={ROWS} />);
    const wrapper = screen.getByRole("table").parentElement;
    expect(wrapper).toHaveClass("overflow-x-auto");
    expect(wrapper).not.toHaveClass("overflow-hidden");
  });
});
