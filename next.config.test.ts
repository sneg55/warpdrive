import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import nextConfig, { CONSENT_PATH } from "./next.config";
import { MAX_IMPORT_CSV_BYTES } from "./src/features/import/importFields";

const { pathToRegexp } = createRequire(import.meta.url)("next/dist/compiled/path-to-regexp") as {
  pathToRegexp: (source: string) => RegExp;
};

const JSON_EXPANSION_HEADROOM = 2.3;

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

describe("next.config React Compiler", () => {
  it("has the compiler enabled", () => {
    expect(nextConfig.reactCompiler).toBe(true);
  });
});

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
