// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Radix DropdownMenu relies on pointer-capture + scrollIntoView, which jsdom lacks.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

// Render Next's Link as a plain anchor so hrefs are assertable without an app-router context.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { UserMenu } from "./UserMenu";

afterEach(cleanup);

describe("UserMenu", () => {
  it("is collapsed by default (no menu shown)", () => {
    render(<UserMenu userId="u1" />);
    const btn = screen.getByRole("button", { name: "Account menu" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("shows the user's initials on the avatar when a name is given", () => {
    render(<UserMenu userId="u1" userName="Nick Snegirev" />);
    expect(screen.getByRole("button", { name: "Account menu" }).textContent).toContain("NS");
  });

  it("renders the uploaded avatar image when avatarUrl is set (not just initials)", () => {
    render(<UserMenu userId="u1" userName="Nick Snegirev" avatarUrl="https://cdn.example/a.png" />);
    const img = screen.getByRole("button", { name: "Account menu" }).querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://cdn.example/a.png");
    // The initials fall back away once the photo is present.
    expect(screen.getByRole("button", { name: "Account menu" }).textContent).not.toContain("NS");
  });

  it("opens a menu with Settings and Log out on click", async () => {
    const user = userEvent.setup();
    render(<UserMenu userId="u1" />);
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    const settings = screen.getByRole("menuitem", { name: /Settings/ });
    const logout = screen.getByRole("menuitem", { name: /Log out/ });
    expect(settings.getAttribute("href")).toBe("/settings/users");
    expect(logout.getAttribute("href")).toBe("/auth/logout");
  });
});
