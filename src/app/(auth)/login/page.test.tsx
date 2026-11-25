// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import LoginPage from "./page";

const providers = vi.hoisted(() => ({ google: true, oidc: false }));

vi.mock("@/features/auth/enabledProviders", () => ({
  enabledSigninProviders: () => providers,
}));

import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
});

function setProviders(next: Partial<typeof providers>): void {
  Object.assign(providers, next);
}

const NO_PARAMS = Promise.resolve({});

describe("login page provider buttons", () => {
  test("google only renders the google button and its workspace hint", async () => {
    setProviders({ google: true, oidc: false });
    render(await LoginPage({ searchParams: NO_PARAMS }));
    expect(screen.getByText("Sign in with Google")).toHaveAttribute("href", "/auth/start/google");
    expect(screen.queryByText("Sign in with SSO")).not.toBeInTheDocument();
    expect(screen.getByText("Use your company Google Workspace account.")).toBeInTheDocument();
  });

  test("oidc enabled renders the sso button and drops the google-specific hint", async () => {
    setProviders({ google: true, oidc: true });
    render(await LoginPage({ searchParams: NO_PARAMS }));
    expect(screen.getByText("Sign in with Google")).toHaveAttribute("href", "/auth/start/google");
    expect(screen.getByText("Sign in with SSO")).toHaveAttribute("href", "/auth/start/oidc");
    expect(
      screen.queryByText("Use your company Google Workspace account."),
    ).not.toBeInTheDocument();
  });

  test("oidc only renders just the sso button", async () => {
    setProviders({ google: false, oidc: true });
    render(await LoginPage({ searchParams: NO_PARAMS }));
    expect(screen.queryByText("Sign in with Google")).not.toBeInTheDocument();
    expect(screen.getByText("Sign in with SSO")).toHaveAttribute("href", "/auth/start/oidc");
  });
});

describe("login page preserves the return path", () => {
  const AUTHORIZE_NEXT = "/oauth/authorize?client_id=c1&state=s1";
  const ENCODED_NEXT = "%2Foauth%2Fauthorize%3Fclient_id%3Dc1%26state%3Ds1";

  test("every provider button carries next to its start route", async () => {
    setProviders({ google: true, oidc: true });
    render(await LoginPage({ searchParams: Promise.resolve({ next: AUTHORIZE_NEXT }) }));
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
    render(await LoginPage({ searchParams: Promise.resolve({ next: "//evil.example/steal" }) }));
    expect(screen.getByText("Sign in with Google")).toHaveAttribute("href", "/auth/start/google");
    expect(screen.getByText("Sign in with SSO")).toHaveAttribute("href", "/auth/start/oidc");
  });
});
