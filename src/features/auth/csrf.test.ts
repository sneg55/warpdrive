import { describe, expect, test } from "vitest";
import { mintCsrfToken, validateCsrf } from "./csrf";

describe("csrf double-submit + origin", () => {
  const origin = "https://app.example.com"; // matches vitest.setup BASE_URL
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
  test("rejects cross-site origin", () => {
    const t = mintCsrfToken();
    const r = validateCsrf({
      cookieToken: t,
      headerToken: t,
      origin: "https://evil.example",
      host,
      secFetchSite: "cross-site",
    });
    expect(r.ok).toBe(false);
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

  // Regression: in dev the app is often served on a different port than BASE_URL
  // (e.g. :3001 when :3000 is taken). A strict Origin === BASE_URL check rejected
  // every same-origin server action with E_AUTH_CSRF. A loopback origin must pass
  // outside production when it is strictly same-origin with the request Host.
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

  // P3: the dev exception must be strictly same-origin. A page on ANOTHER local port shares the
  // host-scoped wd_csrf cookie, so it must NOT be able to post to this instance: a loopback origin
  // whose port differs from the request Host is rejected even with a valid token.
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

  // The dev exception must not blanket-open: a mismatched non-loopback origin is
  // still rejected even with a valid token and same-origin Sec-Fetch-Site.
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
