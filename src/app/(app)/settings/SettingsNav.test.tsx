// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Active detection reads the pathname; pin it to the Users route.
vi.mock("next/navigation", () => ({ usePathname: () => "/settings/users" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { SettingsNav } from "./SettingsNav";

afterEach(cleanup);

describe("SettingsNav", () => {
  it("renders a leading icon on each nav item (Pipedrive parity)", () => {
    render(<SettingsNav isAdmin={true} canManageCompany={true} canImport={true} />);
    const profile = screen.getByRole("link", { name: /Personal preferences/ });
    expect(profile.querySelector("svg")).not.toBeNull();
  });

  it("marks the active item with the Pipedrive blue treatment (not the neutral gray)", () => {
    render(<SettingsNav isAdmin={true} canManageCompany={true} canImport={true} />);
    const active = screen.getByRole("link", { name: /Users/ });
    expect(active.getAttribute("aria-current")).toBe("page");
    // PD highlights the active settings item in blue (text + tinted background), not bg-accent gray.
    expect(active.className).toMatch(/text-blue-700/);
    expect(active.className).toMatch(/bg-blue-50/);
    expect(active.className).not.toContain("bg-accent");
  });

  it("renders idle items in the foreground color, not muted gray (PD near-black)", () => {
    render(<SettingsNav isAdmin={true} canManageCompany={true} canImport={true} />);
    const idle = screen.getByRole("link", { name: /Notifications/ });
    expect(idle.getAttribute("aria-current")).toBeNull();
    expect(idle.className).toContain("text-foreground");
  });

  it("links Connected apps from every account settings menu", () => {
    render(<SettingsNav isAdmin={false} canManageCompany={false} canImport={false} />);
    expect(screen.getByRole("link", { name: /Connected apps/ })).toHaveAttribute(
      "href",
      "/settings/connections",
    );
  });

  // The enrichment page, its config query and its settings actions all require a real admin,
  // so the MANAGE flag alone must not surface a link into that denial page.
  it("shows Enrichment to a real admin", () => {
    render(<SettingsNav isAdmin={true} canManageCompany={true} canImport={false} />);
    expect(screen.getByRole("link", { name: /Enrichment/ })).toHaveAttribute(
      "href",
      "/settings/enrichment",
    );
  });

  it("hides Enrichment from a manager who is not an admin, keeping the rest of the section", () => {
    render(<SettingsNav isAdmin={false} canManageCompany={true} canImport={false} />);
    expect(screen.getByRole("link", { name: /Users/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Enrichment/ })).toBeNull();
  });

  it("renders no company section for a user with neither admin nor manage", () => {
    render(<SettingsNav isAdmin={false} canManageCompany={false} canImport={false} />);
    expect(screen.queryByText("Company overview")).toBeNull();
    expect(screen.queryByRole("link", { name: /Users/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Enrichment/ })).toBeNull();
  });
});
