// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

type PrefActionResult = { ok: true } | { ok: false; error: { id: string } };
const setAppearanceAction = vi.hoisted(() =>
  vi.fn((): Promise<PrefActionResult> => Promise.resolve({ ok: true })),
);
vi.mock("@/features/identity/preferencesActions", () => ({ setAppearanceAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { DARK_CLASS } from "@/features/theme/appearance";
import { UserMenu } from "./UserMenu";

beforeEach(() => {
  document.documentElement.className = "";
  setAppearanceAction.mockClear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// The theme switch belongs where people reach for it. Buried on a settings page it was three
// clicks deep, behind an avatar Settings item that lands on the company roster instead.
describe("UserMenu appearance", () => {
  it("offers the three appearance choices and marks the stored one", async () => {
    render(<UserMenu userId="u1" userName="Ada" appearance="night" />);
    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));

    expect(screen.getByRole("menuitemradio", { name: "Day" })).not.toBeChecked();
    expect(screen.getByRole("menuitemradio", { name: "Night" })).toBeChecked();
    expect(screen.getByRole("menuitemradio", { name: "System" })).not.toBeChecked();
  });

  // Radix unmounts the menu content on close, so state living inside it is reseeded from the
  // server prop on every open. That prop is whatever the page was rendered with, so a pick made
  // this session would silently read back as the old theme.
  it("still shows the pick after the menu is closed and reopened", async () => {
    render(<UserMenu userId="u1" userName="Ada" appearance="day" />);
    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Night" }));
    await waitFor(() => expect(setAppearanceAction).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("menuitemradio", { name: "Night" })).toBeChecked();
    expect(screen.getByRole("menuitemradio", { name: "Day" })).not.toBeChecked();
  });

  it("paints and persists the picked appearance", async () => {
    render(<UserMenu userId="u1" userName="Ada" appearance="day" />);
    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Night" }));

    await waitFor(() => expect(setAppearanceAction).toHaveBeenCalledTimes(1));
    expect(setAppearanceAction).toHaveBeenCalledWith({ appearance: "night" }, "csrf");
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
  });
});
