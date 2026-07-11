// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const actor = {
  id: "actor-1",
  flags: new Set<string>(),
};

vi.mock("@/features/permissions/can", () => ({
  can: vi.fn(() => true),
}));
vi.mock("@/server/trpc/context", () => ({
  createContext: vi.fn(() => Promise.resolve({ actor })),
}));
vi.mock("./ImportHistory", () => ({
  ImportHistory: () => <div>Import history</div>,
}));

afterEach(cleanup);

describe("ImportPage", () => {
  it("renders the settings breadcrumb", async () => {
    const { default: ImportPage } = await import("./page");
    render(await ImportPage());

    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    // Exactly one page title (SettingsHeading owns it; ImportHistory no longer renders its own h1).
    expect(screen.getAllByRole("heading", { level: 1, name: "Import data" })).toHaveLength(1);
    // The New-import action moved into the heading actions slot.
    expect(screen.getByRole("link", { name: "New import" }).getAttribute("href")).toBe(
      "/settings/import/new",
    );
  });
});
