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

describe("login page provider buttons", () => {
  test("google only renders the google button and its workspace hint", () => {
    setProviders({ google: true, oidc: false });
    render(<LoginPage />);
    expect(screen.getByText("Sign in with Google")).toHaveAttribute("href", "/auth/start/google");
    expect(screen.queryByText("Sign in with SSO")).not.toBeInTheDocument();
    expect(screen.getByText("Use your company Google Workspace account.")).toBeInTheDocument();
  });

  test("oidc enabled renders the sso button and drops the google-specific hint", () => {
    setProviders({ google: true, oidc: true });
    render(<LoginPage />);
    expect(screen.getByText("Sign in with Google")).toHaveAttribute("href", "/auth/start/google");
    expect(screen.getByText("Sign in with SSO")).toHaveAttribute("href", "/auth/start/oidc");
    expect(
      screen.queryByText("Use your company Google Workspace account."),
    ).not.toBeInTheDocument();
  });

  test("oidc only renders just the sso button", () => {
    setProviders({ google: false, oidc: true });
    render(<LoginPage />);
    expect(screen.queryByText("Sign in with Google")).not.toBeInTheDocument();
    expect(screen.getByText("Sign in with SSO")).toHaveAttribute("href", "/auth/start/oidc");
  });
});
