import type { MetadataRoute } from "next";
import { pageUrl } from "@/constants/siteMetadata";
import { SITE_PAGES } from "@/constants/sitePages";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return SITE_PAGES.map((page) => ({
    url: pageUrl(page.path),
    lastModified,
    changeFrequency: "monthly",
    priority: page.path === "/" ? 1 : 0.8,
  }));
}
