import { describe, expect, it } from "vitest";
import { LANDING_STRINGS } from "./landingStrings";
import { metadata, SITE_URL } from "./siteMetadata";

describe("site metadata", () => {
  it("uses warpdrivecrm.com as the canonical origin", () => {
    expect(SITE_URL).toBe("https://warpdrivecrm.com");
    expect(metadata.metadataBase?.href).toBe("https://warpdrivecrm.com/");
    expect(metadata.alternates?.canonical).toBe(SITE_URL);
  });

  it("carries a title, the hero pitch as description, and a social card", () => {
    expect(metadata.title).toBeTruthy();
    expect(metadata.description).toBe(LANDING_STRINGS.hero.subtitle);
    expect(metadata.openGraph?.title).toBeTruthy();
    expect(metadata.twitter?.card).toBe("summary_large_image");
  });
});
