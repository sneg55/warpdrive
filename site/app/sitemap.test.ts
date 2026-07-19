import { describe, expect, it } from "vitest";
import { SITE_URL } from "@/constants/siteMetadata";
import sitemap from "./sitemap";

describe("sitemap", () => {
  it("lists the canonical URL with a lastModified freshness signal", () => {
    const entries = sitemap();
    expect(entries).toHaveLength(1);
    const [home] = entries;
    expect(home?.url).toBe(SITE_URL);
    expect(home?.lastModified).toBeInstanceOf(Date);
  });
});
