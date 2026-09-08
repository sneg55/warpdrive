// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { McpConnectCard } from "./McpConnectCard";

afterEach(cleanup);

const ENDPOINT = "https://crm.example.com/api/mcp";

describe("McpConnectCard", () => {
  it("shows the server URL the user pastes into an MCP client", () => {
    render(<McpConnectCard endpointUrl={ENDPOINT} />);
    expect(screen.getByRole("heading", { name: "Connect an AI client" })).not.toBeNull();
    const field = screen.getByLabelText("Server URL");
    expect(field).toBeInstanceOf(HTMLInputElement);
    expect((field as HTMLInputElement).value).toBe(ENDPOINT);
    expect((field as HTMLInputElement).readOnly).toBe(true);
  });

  it("lists the Claude Desktop connector steps and links to the docs", () => {
    render(<McpConnectCard endpointUrl={ENDPOINT} />);
    const steps = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps[0]).toContain("Add custom connector");
    expect(screen.getByRole("link", { name: /guide/i }).getAttribute("href")).toContain(
      "docs.warpdrivecrm.com",
    );
  });

  it("copies the server URL and confirms it", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    render(<McpConnectCard endpointUrl={ENDPOINT} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(ENDPOINT));
    expect(await screen.findByRole("button", { name: "Copied" })).not.toBeNull();
  });
});
