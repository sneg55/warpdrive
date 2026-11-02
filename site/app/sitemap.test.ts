import { describe, expect, it } from "vitest";
import { SITE_URL } from "@/constants/siteMetadata";
import sitemap from "./sitemap";

describe("sitemap", () => {
  it("lists every site page with a lastModified freshness signal", () => {
    const entries = sitemap();
    expect(entries.map((entry) => entry.url)).toEqual([
      SITE_URL,
      `${SITE_URL}/vs/twenty`,
      `${SITE_URL}/vs/espocrm`,
      `${SITE_URL}/migrate-from-pipedrive`,
    ]);
    for (const entry of entries) expect(entry.lastModified).toBeInstanceOf(Date);
  });
});
