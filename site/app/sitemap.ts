import type { MetadataRoute } from "next";
import { SITE_URL } from "@/constants/siteMetadata";

// Statically generate /sitemap.xml at build time. Required by `output: 'export'`, which has no
// server to generate it on request.
export const dynamic = "force-static";

// Single-page site: one URL. Next emits this as a static /sitemap.xml under `output: 'export'`.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE_URL, changeFrequency: "monthly", priority: 1 }];
}
