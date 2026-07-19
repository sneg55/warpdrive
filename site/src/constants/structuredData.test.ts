import { describe, expect, it } from "vitest";
import { LANDING_STRINGS } from "./landingStrings";
import { FAQ_PAGE, ORGANIZATION, SOFTWARE_APPLICATION, STRUCTURED_DATA } from "./structuredData";

describe("structured data (JSON-LD)", () => {
  it("uses the schema.org context and a node graph", () => {
    expect(STRUCTURED_DATA["@context"]).toBe("https://schema.org");
    expect(Array.isArray(STRUCTURED_DATA["@graph"])).toBe(true);
  });

  it("declares Warpdrive as a free, open-source SoftwareApplication", () => {
    expect(SOFTWARE_APPLICATION.name).toBe("Warpdrive");
    expect(SOFTWARE_APPLICATION.applicationCategory).toBe("BusinessApplication");
    expect(SOFTWARE_APPLICATION.isAccessibleForFree).toBe(true);
    expect(SOFTWARE_APPLICATION.offers.price).toBe("0");
    expect(SOFTWARE_APPLICATION.url).toBe("https://warpdrivecrm.com");
  });

  it("declares an Organization linked to the GitHub repo", () => {
    expect(ORGANIZATION.name).toBe("Warpdrive");
    expect(ORGANIZATION.sameAs).toContain(LANDING_STRINGS.hero.ctaHref);
  });

  it("mirrors every FAQ item into a FAQPage question with its answer", () => {
    expect(FAQ_PAGE.mainEntity).toHaveLength(LANDING_STRINGS.faq.items.length);
    for (const item of LANDING_STRINGS.faq.items) {
      const question = FAQ_PAGE.mainEntity.find((q) => q.name === item.q);
      expect(question?.acceptedAnswer.text).toBe(item.a);
    }
  });
});
