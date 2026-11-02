import { describe, expect, it } from "vitest";
import { metadata, pageMetadata, SITE_URL } from "./siteMetadata";
import { TWENTY_PAGE } from "./sitePages";

describe("site metadata", () => {
  it("uses warpdrivecrm.com as the canonical origin", () => {
    expect(SITE_URL).toBe("https://warpdrivecrm.com");
    expect(metadata.metadataBase?.href).toBe("https://warpdrivecrm.com/");
    expect(metadata.alternates?.canonical).toBe(SITE_URL);
  });

  it("carries a title and a snippet-length, keyword-front-loaded description", () => {
    expect(metadata.title).toBeTruthy();
    expect(typeof metadata.description).toBe("string");
    const description = metadata.description ?? "";
    // Google truncates the SERP snippet near 160 chars; keep the whole description within that.
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description).toMatch(/open-source/i);
    expect(description).toMatch(/Pipedrive/i);
    expect(metadata.openGraph?.title).toBeTruthy();
    expect(metadata.twitter?.card).toBe("summary_large_image");
  });

  it("gives each subpage its own canonical URL, title, and description", () => {
    const page = pageMetadata(TWENTY_PAGE);
    expect(page.alternates?.canonical).toBe(`${SITE_URL}/vs/twenty`);
    expect(page.title).toBe(TWENTY_PAGE.title);
    expect(page.description).toBe(TWENTY_PAGE.description);
    expect(page.openGraph?.url).toBe(`${SITE_URL}/vs/twenty`);
  });

  it("points subpages at the generated social card, since their own openGraph hides the inherited one", () => {
    const page = pageMetadata(TWENTY_PAGE);
    expect(page.openGraph?.images).toEqual([
      { url: "/opengraph-image", width: 1200, height: 630, type: "image/png" },
    ]);
  });

  it("defers the social image to the generated 1200x630 card, not an inline icon", () => {
    // app/opengraph-image.tsx supplies og:image; setting images here too would duplicate the tags.
    expect(metadata.openGraph?.images).toBeUndefined();
    expect(metadata.twitter?.images).toBeUndefined();
  });
});
