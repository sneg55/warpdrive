import { describe, expect, it } from "vitest";
import { pageUrl } from "@/constants/siteMetadata";
import { SITE_PAGES } from "@/constants/sitePages";
import sitemap from "./sitemap";

describe("sitemap", () => {
  it("lists every site page", () => {
    expect(sitemap().map((entry) => entry.url)).toEqual(SITE_PAGES.map((page) => pageUrl(page.path)));
  });

  it("dates each entry by when that page's content last changed, not by build time", () => {
    const entries = sitemap();
    SITE_PAGES.forEach((page, i) => {
      expect(entries[i]?.lastModified).toBe(page.updated);
    });
  });

  it("stamps every page with a calendar date", () => {
    for (const page of SITE_PAGES) expect(page.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
