// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { LeftNav } from "./LeftNav";

vi.mock("next/navigation", () => ({ usePathname: () => "/inbox" }));

vi.stubGlobal("matchMedia", (query: string) => ({
  matches: /min-width/.test(query),
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
}));

afterEach(() => {
  cleanup();
  document.cookie = "wd_nav_expanded=; path=/; max-age=0";
});

function inboxLink(): HTMLElement {
  return screen.getByRole("link", { name: /Inbox/ });
}

describe("LeftNav inbox badge placement", () => {
  test("expanded nav puts the badge at the right end of the row, after the label", () => {
    document.cookie = "wd_nav_expanded=1; path=/";
    render(<LeftNav initialExpanded inboxBadge={<span data-testid="badge">362</span>} />);
    const badge = screen.getByTestId("badge");
    const icon = inboxLink().querySelector("svg");
    expect(icon?.parentElement?.contains(badge)).toBe(false);
    expect(inboxLink().lastElementChild?.contains(badge)).toBe(true);
    expect(badge.parentElement?.className).toMatch(/\bml-auto\b/);
  });

  test("collapsed nav keeps the badge pinned to the icon corner", () => {
    document.cookie = "wd_nav_expanded=0; path=/";
    render(<LeftNav initialExpanded={false} inboxBadge={<span data-testid="badge">3</span>} />);
    const badge = screen.getByTestId("badge");
    const icon = inboxLink().querySelector("svg");
    expect(icon?.parentElement?.contains(badge)).toBe(true);
  });
});
