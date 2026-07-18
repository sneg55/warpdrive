import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// This site sits inside the ve-warpdrive repo, which has its own root lockfile. Without pinning the
// root, Next infers the repo root as the workspace root, then resolves `src/` to the CRM app's src
// (dragging in instrumentation.ts, pg-boss, etc.) and the build fails. Pin it to this directory so
// module resolution and file tracing stay inside site/.
const root = path.dirname(fileURLToPath(import.meta.url));

// Static marketing site. `output: 'export'` writes a fully static `out/` (no Node server), which is
// what Cloudflare Pages serves. `images.unoptimized` is required under export: there is no image
// optimization server, so next/image emits plain <img> tags. See
// docs/superpowers/specs/2026-07-18-landing-cloudflare-pages-design.md.
const nextConfig: NextConfig = {
  output: "export",
  turbopack: { root },
  outputFileTracingRoot: root,
  images: { unoptimized: true },
  experimental: {
    // The landing pulls a handful of icons from the lucide-react barrel; rewrite them to direct
    // module paths so a single icon does not drag the whole barrel into the bundle.
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
