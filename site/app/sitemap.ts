import type { MetadataRoute } from "next";
import { SITE_URL } from "@/constants/siteMetadata";

// Statically generate /sitemap.xml at build time. Required by `output: 'export'`, which has no
// server to generate it on request.
export const dynamic = "force-static";

// Single-page site: one URL. Next emits this as a static /sitemap.xml under `output: 'export'`.
// lastModified is the build timestamp: the site is a static export that rebuilds and redeploys on
// every release, so "last generated" is an honest freshness signal for crawlers on each deploy.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE_URL, lastModified: new Date(), changeFrequency: "monthly", priority: 1 }];
}
