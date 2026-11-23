// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import LoginPage from "./page";

const providers = vi.hoisted(() => ({ google: true, oidc: false }));

vi.mock("@/features/auth/enabledProviders", () => ({
  enabledSigninProviders: () => providers,
}));

import "@testing-library/jest-dom/vitest";

const AUTHORIZE_NEXT = "/oauth/authorize?client_id=c1&state=s1";
const ENCODED_NEXT = "%2Foauth%2Fauthorize%3Fclient_id%3Dc1%26state%3Ds1";

afterEach(() => {
  cleanup();
});

function setProviders(next: Partial<typeof providers>): void {
  Object.assign(providers, next);
}

async function renderPage(params: Record<string, string | string[]> = {}) {
  return render(await LoginPage({ searchParams: Promise.resolve(params) }));
}

describe("login page provider buttons", () => {
  test("google only renders the google button and its workspace hint", async () => {
    setProviders({ google: true, oidc: false });
    await renderPage();
    expect(screen.getByText("Sign in with Google")).toHaveAttribute("href", "/auth/start/google");
    expect(screen.queryByText("Sign in with SSO")).not.toBeInTheDocument();
    expect(screen.getByText("Use your company Google Workspace account.")).toBeInTheDocument();
  });

  test("oidc enabled renders the sso button and drops the google-specific hint", async () => {
    setProviders({ google: true, oidc: true });
    await renderPage();
    expect(screen.getByText("Sign in with Google")).toHaveAttribute("href", "/auth/start/google");
    expect(screen.getByText("Sign in with SSO")).toHaveAttribute("href", "/auth/start/oidc");
    expect(
      screen.queryByText("Use your company Google Workspace account."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Use the account your administrator set up for you."),
    ).toBeInTheDocument();
  });

  test("oidc only renders just the sso button", async () => {
    setProviders({ google: false, oidc: true });
    await renderPage();
    expect(screen.queryByText("Sign in with Google")).not.toBeInTheDocument();
    expect(screen.getByText("Sign in with SSO")).toHaveAttribute("href", "/auth/start/oidc");
  });
});

describe("login page preserves the return path", () => {
  test("every provider button carries next to its start route", async () => {
    setProviders({ google: true, oidc: true });
    await renderPage({ next: AUTHORIZE_NEXT });
    expect(screen.getByText("Sign in with Google")).toHaveAttribute(
      "href",
      `/auth/start/google?next=${ENCODED_NEXT}`,
    );
    expect(screen.getByText("Sign in with SSO")).toHaveAttribute(
      "href",
      `/auth/start/oidc?next=${ENCODED_NEXT}`,
    );
  });

  test("an off-site next is dropped rather than forwarded", async () => {
    setProviders({ google: true, oidc: true });
    await renderPage({ next: "//evil.example/steal" });
    expect(screen.getByText("Sign in with Google")).toHaveAttribute("href", "/auth/start/google");
    expect(screen.getByText("Sign in with SSO")).toHaveAttribute("href", "/auth/start/oidc");
  });
});

describe("login failure feedback", () => {
  test("shows an alert when the callback returned with an error", async () => {
    setProviders({ google: true, oidc: true });
    await renderPage({ error: "auth_failed" });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Sign-in failed");
    expect(alert).toHaveTextContent("We could not complete the sign-in.");
  });

  test("never shows the server-side reason to the visitor", async () => {
    setProviders({ google: true, oidc: true });
    const { container } = await renderPage({ error: "auth_failed" });
    expect(container.textContent).not.toContain("auth_failed");
  });

  test("shows no alert on a plain visit", async () => {
    setProviders({ google: true, oidc: true });
    await renderPage();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("shows no alert for an empty error parameter", async () => {
    setProviders({ google: true, oidc: true });
    await renderPage({ error: "" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("still renders the provider buttons alongside the alert", async () => {
    setProviders({ google: true, oidc: false });
    await renderPage({ error: "auth_failed" });
    expect(screen.getByText("Sign in with Google")).toHaveAttribute("href", "/auth/start/google");
  });

  test("the alert and the preserved return path coexist", async () => {
    setProviders({ google: true, oidc: true });
    await renderPage({ error: "auth_failed", next: AUTHORIZE_NEXT });
    expect(screen.getByRole("alert")).toHaveTextContent("Sign-in failed");
    expect(screen.getByText("Sign in with Google")).toHaveAttribute(
      "href",
      `/auth/start/google?next=${ENCODED_NEXT}`,
    );
    expect(screen.getByText("Sign in with SSO")).toHaveAttribute(
      "href",
      `/auth/start/oidc?next=${ENCODED_NEXT}`,
    );
  });
});
