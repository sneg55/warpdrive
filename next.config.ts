import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "pg-boss"],
  // Auto-memoizes components and hooks, replacing hand-written useMemo/useCallback. Safe only
  // because the rules of hooks are now enforced: eslint-plugin-react-hooks runs clean across src.
  // The compiler assumes purity and correct dependencies, and silently bails out of any component
  // it cannot prove pure, so it is enabled only after that lint pass, never before.
  // Top-level, not experimental: Next 16 promoted the key.
  reactCompiler: true,
  experimental: {
    // Icons are imported from the lucide-react barrel in ~13 files. Without this, any chunk that
    // touches one icon pulls the whole barrel; Next rewrites them to direct module paths instead.
    optimizePackageImports: ["lucide-react"],
    // The CSV importer POSTs the entire parsed rows array through the createBatchAction
    // server action, whose JSON encoding runs ~2.2x the raw file bytes. Next defaults this
    // to ~1 MB, so any CSV over a few hundred KB passes the 25 MB client cap
    // (MAX_IMPORT_CSV_BYTES) then fails at the server. Raise it to cover that cap's JSON
    // expansion. Stopgap: the storage-backed import overhaul moves the bytes off the request
    // path entirely, making this irrelevant. Tied to the client cap by next.config.test.ts.
    serverActions: { bodySizeLimit: "64mb" },
  },
};

export default nextConfig;
