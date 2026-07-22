// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { LeftNav } from "./LeftNav";

// LeftNav reads the current path via usePathname to mark the active item; mock it so the
// component renders outside an app-router provider.
vi.mock("next/navigation", () => ({ usePathname: () => "/pipeline" }));

// The collapse preference now persists in a cookie (so the server can read it and render the
// correct width, avoiding the reload flash). jsdom provides a working document.cookie; clear it
// between tests. Reset to a clean jar by expiring the key.
function clearNavCookie(): void {
  document.cookie = "wd_nav_expanded=; path=/; max-age=0";
}

// jsdom has no matchMedia; shim it so the responsive default (expanded on wide screens, collapsed
// on small) can be exercised. `setViewport(true)` = wide (min-width query matches).
let mediaMatches = true;
function setViewport(wide: boolean): void {
  mediaMatches = wide;
}
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: /min-width/.test(query) ? mediaMatches : !mediaMatches,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
}));

afterEach(() => {
  cleanup();
  clearNavCookie();
  mediaMatches = true;
});

describe("LeftNav", () => {
  test("server render honors initialExpanded so the width is correct at first paint (no reload flash)", () => {
    // The flash was caused by the server always rendering collapsed (localStorage is not readable
    // during SSR) and the client correcting to expanded post-mount, animating the width. With the
    // persisted state passed in as initialExpanded, the server render already reflects it, so there
    // is nothing to correct and nothing to animate.
    expect(renderToStaticMarkup(<LeftNav initialExpanded />)).toMatch(/w-56\b/);
    expect(renderToStaticMarkup(<LeftNav initialExpanded={false} />)).toMatch(/w-16\b/);
  });

  test("renders all primary destinations as links with a navigation landmark", () => {
    render(<LeftNav />);
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Pipeline" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
  });

  test("labels the stats destination 'Performance', not 'Dashboard'", () => {
    render(<LeftNav />);
    expect(screen.getByRole("link", { name: "Performance" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Dashboard" })).toBeNull();
  });

  test("marks the active section with aria-current", () => {
    render(<LeftNav />);
    expect(screen.getByRole("link", { name: "Pipeline" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "Contacts" }).getAttribute("aria-current")).toBeNull();
  });

  test("each destination shows a decorative icon (Pipedrive-style icon+label nav)", () => {
    const { container } = render(<LeftNav />);
    const links = container.querySelectorAll("nav a");
    // Every link carries an icon, and icons are aria-hidden so the accessible
    // name stays the label text.
    for (const link of links) {
      expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
    expect(links.length).toBeGreaterThan(0);
  });

  test("defaults to expanded on a wide screen (no stored preference)", () => {
    setViewport(true);
    render(<LeftNav />);
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).not.toBeNull();
    expect(screen.getByText("Pipeline").className).not.toContain("sr-only");
    expect(screen.getByRole("navigation", { name: "Primary" }).className).toMatch(/w-56\b/);
  });

  test("defaults to the collapsed rail on a small screen (no stored preference)", () => {
    setViewport(false);
    render(<LeftNav />);
    expect(screen.getByRole("button", { name: "Expand sidebar" })).not.toBeNull();
    expect(screen.getByText("Pipeline").className).toContain("sr-only");
    expect(screen.getByRole("navigation", { name: "Primary" }).className).toMatch(/w-16\b/);
  });

  test("collapses to icons and expands to full labels via a toggle button", () => {
    // Start collapsed (small screen), then toggle expands.
    setViewport(false);
    render(<LeftNav />);
    const toggle = screen.getByRole("button", { name: "Expand sidebar" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Pipeline").className).toContain("sr-only");

    fireEvent.click(toggle);
    const collapse = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(collapse.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Pipeline").className).not.toContain("sr-only");
  });

  test("an explicit expand preference overrides the small-screen default across mounts", () => {
    // Small screen would default collapsed, but the user's stored choice wins.
    setViewport(false);
    const first = render(<LeftNav />);
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    first.unmount();

    render(<LeftNav />);
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).not.toBeNull();
    expect(screen.getByText("Settings").className).not.toContain("sr-only");
  });

  test("an explicit collapse preference overrides the wide-screen default across mounts", () => {
    // Wide screen would default expanded, but a stored collapse choice wins.
    setViewport(true);
    const first = render(<LeftNav />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    first.unmount();

    render(<LeftNav />);
    expect(screen.getByRole("button", { name: "Expand sidebar" })).not.toBeNull();
    expect(screen.getByText("Settings").className).toContain("sr-only");
  });

  test("is a narrow, dark, icon-only rail (Pipedrive) with visually hidden labels when collapsed", () => {
    setViewport(false);
    const { container } = render(<LeftNav />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    // Narrow fixed-width rail, not a wide labelled sidebar.
    expect(nav.className).toMatch(/w-16\b/);
    // Dark rail surface.
    expect(nav.className).toMatch(/bg-(slate|zinc|neutral|gray)-9\d0/);
    // Labels are present for a11y but visually hidden (icon-only look).
    for (const link of container.querySelectorAll("nav a")) {
      const label = link.querySelector("span.sr-only");
      expect(label).not.toBeNull();
    }
  });
});
