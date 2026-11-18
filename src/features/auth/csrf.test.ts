import { describe, expect, test } from "vitest";
import { mintCsrfToken, validateCsrf } from "./csrf";

describe("csrf double-submit + origin", () => {
  const origin = "https://app.example.com";
  const host = "app.example.com";

  test("valid when cookie === header and origin matches", () => {
    const t = mintCsrfToken();
    const r = validateCsrf({
      cookieToken: t,
      headerToken: t,
      origin,
      host,
      secFetchSite: "same-origin",
    });
    expect(r.ok).toBe(true);
  });
  test("rejects mismatched tokens", () => {
    const r = validateCsrf({
      cookieToken: mintCsrfToken(),
      headerToken: mintCsrfToken(),
      origin,
      host,
      secFetchSite: "same-origin",
    });
    expect(r.ok).toBe(false);
  });
  test("rejects a foreign origin as an origin mismatch", () => {
    const t = mintCsrfToken();
    const r = validateCsrf({
      cookieToken: t,
      headerToken: t,
      origin: "https://evil.example",
      host,
      secFetchSite: "same-origin",
    });
    expect(r).toEqual({ ok: false, error: "origin mismatch" });
  });
  test.each([
    ["matching origin", origin],
    ["absent origin", null],
  ])("rejects Sec-Fetch-Site cross-site with a %s", (_label, requestOrigin) => {
    const t = mintCsrfToken();
    const r = validateCsrf({
      cookieToken: t,
      headerToken: t,
      origin: requestOrigin,
      host,
      secFetchSite: "cross-site",
    });
    expect(r).toEqual({ ok: false, error: "cross-site request rejected" });
  });
  test("rejects missing token", () => {
    const r = validateCsrf({
      cookieToken: null,
      headerToken: null,
      origin,
      host,
      secFetchSite: "same-origin",
    });
    expect(r.ok).toBe(false);
  });

  test("accepts a same-origin loopback dev request on a non-BASE_URL port", () => {
    const t = mintCsrfToken();
    const r = validateCsrf({
      cookieToken: t,
      headerToken: t,
      origin: "http://localhost:3001",
      host: "localhost:3001",
      secFetchSite: "same-origin",
    });
    expect(r.ok).toBe(true);
  });

  test("rejects a loopback origin from a different port than the request host (cross-port)", () => {
    const t = mintCsrfToken();
    const r = validateCsrf({
      cookieToken: t,
      headerToken: t,
      origin: "http://localhost:1234",
      host: "localhost:3001",
      secFetchSite: "same-site",
    });
    expect(r.ok).toBe(false);
  });

  test("still rejects a mismatched non-loopback origin", () => {
    const t = mintCsrfToken();
    const r = validateCsrf({
      cookieToken: t,
      headerToken: t,
      origin: "https://evil.example",
      host: "evil.example",
      secFetchSite: "same-origin",
    });
    expect(r.ok).toBe(false);
  });
});
