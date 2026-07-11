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
