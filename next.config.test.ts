import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";
import { MAX_IMPORT_CSV_BYTES } from "./src/features/import/importFields";

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
async function headerMap(source: string): Promise<Map<string, string>> {
  const entries = (await nextConfig.headers?.()) ?? [];
  const match = entries.find((e) => e.source === source);
  return new Map((match?.headers ?? []).map((h) => [h.key.toLowerCase(), h.value]));
}

describe("next.config security headers", () => {
  it("denies framing of every route via CSP frame-ancestors", async () => {
    const csp = (await headerMap("/:path*")).get("content-security-policy");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("denies framing via X-Frame-Options for pre-CSP-2 browsers", async () => {
    expect((await headerMap("/:path*")).get("x-frame-options")).toBe("DENY");
  });

  it("pins base-uri and form-action so injected markup cannot retarget the consent form", async () => {
    const csp = (await headerMap("/:path*")).get("content-security-policy");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("blocks plugin content via object-src", async () => {
    const csp = (await headerMap("/:path*")).get("content-security-policy");
    expect(csp).toContain("object-src 'none'");
  });

  it("stops MIME sniffing", async () => {
    expect((await headerMap("/:path*")).get("x-content-type-options")).toBe("nosniff");
  });

  it("keeps referrers off cross-origin requests", async () => {
    expect((await headerMap("/:path*")).get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("does not advertise the framework version", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
