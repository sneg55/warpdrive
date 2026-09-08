import { describe, expect, it } from "vitest";
import { resolveMcpEndpoint } from "./mcpEndpoint";

describe("resolveMcpEndpoint", () => {
  it("returns the remote MCP endpoint under the public base URL", () => {
    expect(resolveMcpEndpoint({ mcpEnabled: true, baseUrl: "https://crm.example.com/" })).toBe(
      "https://crm.example.com/api/mcp",
    );
  });

  it("returns null when the MCP server is disabled", () => {
    expect(resolveMcpEndpoint({ mcpEnabled: false, baseUrl: "https://crm.example.com" })).toBe(
      null,
    );
  });
});
