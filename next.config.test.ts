import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import nextConfig, { CONSENT_PATH } from "./next.config";
import { MAX_IMPORT_CSV_BYTES } from "./src/features/import/importFields";

// The exact matcher Next runs a headers() `source` through, so these tests resolve a path the way
// the server does instead of re-implementing the syntax. Next vendors it without typings, and the
// standalone package on npm is v8, which dropped the inline-regex syntax this config depends on,
// so it is reached through Next's copy.
const { pathToRegexp } = createRequire(import.meta.url)("next/dist/compiled/path-to-regexp") as {
  pathToRegexp: (source: string) => RegExp;
};

// The importer parses the CSV in the browser and POSTs the entire parsed rows array through
// the createBatchAction server action. That JSON encoding runs materially larger than the raw
// CSV bytes (measured on a real 2.0 MB file: a 4.32 MB server-action payload, ~2.2x). If the
// server-action body limit does not cover MAX_IMPORT_CSV_BYTES's JSON expansion, every
// non-trivial upload passes the 25 MB client check then dies at the ~1 MB Next.js default.
// This test ties the two limits together so they cannot silently diverge again.
// NB: a stopgap. The storage-backed import overhaul removes the cross-request row payload
// entirely, at which point this limit (and this test) become irrelevant.
const JSON_EXPANSION_HEADROOM = 2.3;

// Mirror Next's `bytes` parser (1024-based units) for the string form of SizeLimit.
function toBytes(limit: string | number | undefined): number {
  if (typeof limit === "number") return limit;
  if (limit === undefined) return 0;
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)?$/i.exec(limit.trim());
  if (match === null) return 0;
  const scale: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 ** 2,
    gb: 1024 ** 3,
    tb: 1024 ** 4,
  };
  return Number(match[1]) * (scale[(match[2] ?? "b").toLowerCase()] ?? 1);
}

// React Compiler auto-memoizes components. It assumes the rules of hooks hold, and silently bails
// out of any component it cannot prove pure, so it must only be enabled once
// eslint-plugin-react-hooks runs clean. The lint config is the guard; this pins that it stays on.
describe("next.config React Compiler", () => {
  it("has the compiler enabled", () => {
    expect(nextConfig.reactCompiler).toBe(true);
  });
});

// Icons are imported from the `lucide-react` barrel across the app. Without this hint Next pulls
// the whole barrel into any chunk touching one icon. Listing the package makes Next rewrite each
// barrel import to its direct module path at build time.
describe("next.config barrel optimization", () => {
  it("optimizes the lucide-react barrel", () => {
    expect(nextConfig.experimental?.optimizePackageImports).toContain("lucide-react");
  });
});

describe("next.config server-action body limit", () => {
  it("covers the JSON expansion of the client CSV import cap", () => {
    const limit = nextConfig.experimental?.serverActions?.bodySizeLimit;
    const limitBytes = toBytes(limit);
    expect(limitBytes).toBeGreaterThanOrEqual(MAX_IMPORT_CSV_BYTES * JSON_EXPANSION_HEADROOM);
  });
});

// Security response headers. The load-bearing one is frame-ancestors: /oauth/authorize/consent
// renders a one-click "Allow access" form whose CSRF token is already in the action URL, so a
// framed same-origin submit passes every check in validateCsrf (token matches, Origin is ours,
// Sec-Fetch-Site is same-origin). Without frame-ancestors an attacker page can overlay that
// consent screen and clickjack a victim into granting their OAuth client full MCP access.
// CSRF defenses do not stop clickjacking; only the frame directives do.
// Next applies EVERY headers() entry whose source matches, not just the first, and a browser
// intersects two Content-Security-Policy headers (the most restrictive value of each directive
// wins). So a route cannot loosen a directive by adding a second header; it has to be excluded
// from the strict entry. Resolving all matches here is what makes that trap visible to the tests.
async function headersForPath(path: string): Promise<Map<string, string[]>> {
  const entries = (await nextConfig.headers?.()) ?? [];
  const resolved = new Map<string, string[]>();
  for (const entry of entries) {
    if (!pathToRegexp(entry.source).test(path)) continue;
    for (const header of entry.headers) {
      const key = header.key.toLowerCase();
      resolved.set(key, [...(resolved.get(key) ?? []), header.value]);
    }
  }
  return resolved;
}

async function cspForPath(path: string): Promise<string> {
  const values = (await headersForPath(path)).get("content-security-policy") ?? [];
  // More than one is the bug this helper exists to catch: it means the path matched both entries.
  expect(values).toHaveLength(1);
  return values.join("");
}

const ORDINARY_PATH = "/deals";

describe("next.config security headers", () => {
  it("denies framing of every route via CSP frame-ancestors", async () => {
    expect(await cspForPath(ORDINARY_PATH)).toContain("frame-ancestors 'none'");
    expect(await cspForPath(CONSENT_PATH)).toContain("frame-ancestors 'none'");
  });

  it("denies framing via X-Frame-Options for pre-CSP-2 browsers", async () => {
    expect((await headersForPath(ORDINARY_PATH)).get("x-frame-options")).toEqual(["DENY"]);
    expect((await headersForPath(CONSENT_PATH)).get("x-frame-options")).toEqual(["DENY"]);
  });

  it("pins base-uri and form-action so injected markup cannot retarget forms", async () => {
    const csp = await cspForPath(ORDINARY_PATH);
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("blocks plugin content via object-src", async () => {
    expect(await cspForPath(ORDINARY_PATH)).toContain("object-src 'none'");
    expect(await cspForPath(CONSENT_PATH)).toContain("object-src 'none'");
  });

  it("stops MIME sniffing", async () => {
    expect((await headersForPath(ORDINARY_PATH)).get("x-content-type-options")).toEqual([
      "nosniff",
    ]);
  });

  it("keeps referrers off cross-origin requests", async () => {
    expect((await headersForPath(ORDINARY_PATH)).get("referrer-policy")).toEqual([
      "strict-origin-when-cross-origin",
    ]);
  });

  it("does not advertise the framework version", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});

// form-action is enforced against a form submission's ENTIRE redirect chain, not just its initial
// target. The consent form posts same-origin to /oauth/authorize, which answers with a 302 to the
// OAuth client's registered redirect_uri (e.g. http://localhost:3118/callback). Under
// form-action 'self' the browser refuses that hop with no error the user can see: the auth code is
// minted and stored, the page simply does not move, and "Allow access" looks dead. Verified in
// Chrome against a copy of these exact headers.
describe("next.config consent-screen form-action exemption", () => {
  it("does not constrain form-action on the consent screen", async () => {
    expect(await cspForPath(CONSENT_PATH)).not.toContain("form-action");
  });

  it("keeps the exemption to the consent path alone", async () => {
    for (const path of [
      ORDINARY_PATH,
      "/",
      "/oauth/authorize",
      "/oauth/authorize/consent/nested",
    ]) {
      expect(await cspForPath(path)).toContain("form-action 'self'");
    }
  });

  it("exempts the consent path in its trailing-slash form too", async () => {
    expect(await cspForPath(`${CONSENT_PATH}/`)).not.toContain("form-action");
  });
});
