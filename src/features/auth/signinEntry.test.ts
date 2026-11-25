import { describe, expect, test } from "vitest";
import { signinEntryPath, withReturnPath } from "./signinEntry";

const NEXT = "/oauth/authorize?client_id=c1&state=s1";
const ENCODED = "%2Foauth%2Fauthorize%3Fclient_id%3Dc1%26state%3Ds1";

describe("withReturnPath", () => {
  test("appends the encoded return path", () => {
    expect(withReturnPath("/auth/start/google", NEXT)).toBe(`/auth/start/google?next=${ENCODED}`);
  });

  test("leaves the path bare for the default return path", () => {
    expect(withReturnPath("/login", "/")).toBe("/login");
  });

  test("drops an unsafe return path", () => {
    expect(withReturnPath("/login", "//evil.example")).toBe("/login");
    expect(withReturnPath("/login", "https://evil.example")).toBe("/login");
  });
});

describe("signinEntryPath", () => {
  test("a google-only deployment starts google directly", () => {
    expect(signinEntryPath({ google: true, oidc: false }, NEXT)).toBe(
      `/auth/start/google?next=${ENCODED}`,
    );
  });

  test("an oidc-only deployment starts oidc directly", () => {
    expect(signinEntryPath({ google: false, oidc: true }, NEXT)).toBe(
      `/auth/start/oidc?next=${ENCODED}`,
    );
  });

  test("both providers lead to the login page so the user chooses", () => {
    expect(signinEntryPath({ google: true, oidc: true }, NEXT)).toBe(`/login?next=${ENCODED}`);
  });

  test("no provider falls back to the login page", () => {
    expect(signinEntryPath({ google: false, oidc: false }, NEXT)).toBe(`/login?next=${ENCODED}`);
  });
});
