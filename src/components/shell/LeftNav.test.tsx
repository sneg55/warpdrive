// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DOCS_SITE_URL } from "@/constants/docs";
import { LeftNav } from "./LeftNav";

vi.mock("next/navigation", () => ({ usePathname: () => "/pipeline" }));

function clearNavCookie(): void {
  document.cookie = "wd_nav_expanded=; path=/; max-age=0";
}

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
    setViewport(false);
    const first = render(<LeftNav />);
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    first.unmount();

    render(<LeftNav />);
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).not.toBeNull();
    expect(screen.getByText("Settings").className).not.toContain("sr-only");
  });

  test("an explicit collapse preference overrides the wide-screen default across mounts", () => {
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
    expect(nav.className).toMatch(/w-16\b/);
    expect(nav.className).toMatch(/bg-(slate|zinc|neutral|gray)-9\d0/);
    for (const link of container.querySelectorAll("nav a")) {
      const label = link.querySelector("span.sr-only");
      expect(label).not.toBeNull();
    }
  });
});

describe("LeftNav bracket shortcuts", () => {
  test("] collapses an expanded rail", () => {
    setViewport(true);
    render(<LeftNav />);
    fireEvent.keyDown(window, { key: "]" });
    expect(screen.getByRole("button", { name: "Expand sidebar" })).not.toBeNull();
  });

  test("[ expands a collapsed rail", () => {
    setViewport(false);
    render(<LeftNav />);
    fireEvent.keyDown(window, { key: "[" });
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).not.toBeNull();
  });

  test("[ on an already expanded rail leaves it expanded", () => {
    setViewport(true);
    render(<LeftNav />);
    fireEvent.keyDown(window, { key: "[" });
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).not.toBeNull();
  });

  test("the bracket choice persists across mounts like the toggle button", () => {
    setViewport(true);
    const first = render(<LeftNav />);
    fireEvent.keyDown(window, { key: "]" });
    first.unmount();

    render(<LeftNav />);
    expect(screen.getByRole("button", { name: "Expand sidebar" })).not.toBeNull();
  });

  test("does not fire while typing in a text field", () => {
    setViewport(true);
    render(<LeftNav />);
    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "]" });
    input.remove();
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).not.toBeNull();
  });

  test("does not fire while a dialog is open", () => {
    setViewport(true);
    render(<LeftNav />);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    fireEvent.keyDown(window, { key: "]" });
    dialog.remove();
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).not.toBeNull();
  });

  test("links to the docs site in a new tab", () => {
    setViewport(true);
    render(<LeftNav />);
    const docs = screen.getByRole("link", { name: "Docs" });
    expect(docs.getAttribute("href")).toBe(DOCS_SITE_URL);
    expect(docs.getAttribute("target")).toBe("_blank");
    expect(docs.getAttribute("rel")).toContain("noreferrer");
  });

  test("the docs link sits directly above the collapse toggle", () => {
    setViewport(true);
    render(<LeftNav />);
    const docs = screen.getByRole("link", { name: "Docs" });
    const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(docs.nextElementSibling).toBe(toggle);
  });

  test("keeps an accessible name for the docs link on the collapsed rail", () => {
    setViewport(false);
    render(<LeftNav />);
    expect(screen.getByRole("link", { name: "Docs" })).not.toBeNull();
  });
});
