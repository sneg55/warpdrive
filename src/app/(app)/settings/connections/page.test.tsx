// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STRINGS } from "@/constants/strings";

const env = { MCP_ENABLED: true, BASE_URL: "https://crm.example.com" };
const listConnections = vi.fn(() => Promise.resolve([]));

vi.mock("@/config/env", () => ({ env }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/server/trpc/context", () => ({
  createContext: vi.fn(() => Promise.resolve({ db: {}, actor: { type: "member" } })),
}));
vi.mock("@/server/trpc/root", () => ({
  createCaller: () => ({ oauth: { listConnections } }),
}));
vi.mock("./ConnectionsClient", () => ({
  ConnectionsClient: () => <div>{STRINGS.settings.connectedAppsEmpty}</div>,
}));

afterEach(cleanup);

describe("ConnectionsPage", () => {
  it("shows the connect card with the MCP endpoint when the server is enabled", async () => {
    env.MCP_ENABLED = true;
    const { default: Page } = await import("./page");
    render(await Page());
    expect(screen.getByLabelText(STRINGS.settings.mcpConnectServerUrl)).toHaveProperty(
      "value",
      "https://crm.example.com/api/mcp",
    );
  });

  it("hides the connect card when the MCP server is disabled", async () => {
    env.MCP_ENABLED = false;
    const { default: Page } = await import("./page");
    render(await Page());
    expect(screen.queryByText(STRINGS.settings.mcpConnectTitle)).toBeNull();
    expect(screen.getByText(STRINGS.settings.connectedAppsEmpty)).not.toBeNull();
  });
});
