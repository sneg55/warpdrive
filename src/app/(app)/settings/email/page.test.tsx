// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const actor = {
  id: "actor-1",
  flags: new Set<string>(),
};

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/server/trpc/context", () => ({
  createContext: vi.fn(() => Promise.resolve({ actor })),
}));
vi.mock("@/features/email/emailAuthoringReads", () => ({
  listSignatures: vi.fn(() => Promise.resolve([])),
  listTemplatesForSettings: vi.fn(() => Promise.resolve([])),
}));
vi.mock("./TemplatesSettingsClient", () => ({
  TemplatesSettingsClient: () => <div>Templates client</div>,
}));
vi.mock("./SignaturesSettingsClient", () => ({
  SignaturesSettingsClient: () => <div>Signatures client</div>,
}));

afterEach(cleanup);

describe("EmailSettingsPage", () => {
  it("renders the settings breadcrumb", async () => {
    const { default: EmailSettingsPage } = await import("./page");
    render(await EmailSettingsPage());

    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    expect(screen.getByRole("heading", { level: 1, name: "Email templates" })).not.toBeNull();
  });
});
