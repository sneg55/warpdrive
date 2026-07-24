// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Consent } from "./consent";

afterEach(cleanup);

// Approving here grants an OAuth client a token that can read and write the whole CRM through
// /api/mcp. With dynamic registration open, the client name is a string an unauthenticated
// stranger POSTed to /oauth/register, so the screen must not repeat it in the product's own
// voice ("Allow Warpdrive Gmail Sync to access warpdrive?" reads as an endorsement). What the
// user can actually verify is where the grant gets sent, so that has to be on screen.
function renderConsent(overrides: Partial<Parameters<typeof Consent>[0]> = {}) {
  render(
    <Consent
      action="/oauth/authorize?client_id=abc"
      clientName="Warpdrive Gmail Sync"
      redirectUri="https://evil.example.com/callback"
      {...overrides}
    />,
  );
}

describe("OAuth consent screen", () => {
  it("shows the host that will receive the grant", () => {
    renderConsent();
    expect(screen.getByTestId("consent-redirect-host")).toHaveTextContent("evil.example.com");
  });

  it("marks the client name as self-reported rather than stating it as fact", () => {
    renderConsent();
    const label = screen.getByTestId("consent-client-name");
    expect(label).toHaveTextContent("Warpdrive Gmail Sync");
    // The name and the product's own assertion must not be the same sentence.
    expect(label.textContent).not.toContain("warpdrive?");
  });

  it("does not put the unverified client name in the heading", () => {
    renderConsent();
    expect(screen.getByRole("heading").textContent).not.toContain("Warpdrive Gmail Sync");
  });

  it("warns the user to deny when they did not start the connection", () => {
    renderConsent();
    expect(screen.getByTestId("consent-warning")).toBeInTheDocument();
  });

  it("still renders both decisions", () => {
    renderConsent();
    expect(screen.getByRole("button", { name: /deny/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /allow/i })).toBeInTheDocument();
  });

  // A loopback redirect is the normal shape for a desktop MCP client, and showing a bare
  // "localhost" is the honest answer rather than dressing it up as a domain.
  it("shows loopback redirects as-is", () => {
    renderConsent({ redirectUri: "http://127.0.0.1:8765/callback" });
    expect(screen.getByTestId("consent-redirect-host")).toHaveTextContent("127.0.0.1");
  });

  // A private-use scheme has no host at all; the screen must degrade rather than render
  // an empty box that looks like a missing value.
  it("falls back to the full uri when the scheme carries no host", () => {
    renderConsent({ redirectUri: "com.example.app:/oauth-callback" });
    expect(screen.getByTestId("consent-redirect-host")).toHaveTextContent("com.example.app");
  });
});
