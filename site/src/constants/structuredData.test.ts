import { describe, expect, it } from "vitest";
import { LANDING_STRINGS, PRODUCT_SUMMARY } from "./landingStrings";
import {
  buildStructuredData,
  FAQ_PAGE,
  OPENALTERNATIVE_URL,
  ORGANIZATION,
  SOFTWARE_APPLICATION,
} from "./structuredData";

function softwareNode(data: ReturnType<typeof buildStructuredData>) {
  const [node] = data["@graph"];
  expect(node["@type"]).toBe("SoftwareApplication");
  return node;
}

describe("structured data (JSON-LD)", () => {
  it("uses the schema.org context and a node graph", () => {
    const data = buildStructuredData(null);
    expect(data["@context"]).toBe("https://schema.org");
    expect(Array.isArray(data["@graph"])).toBe(true);
  });

  it("declares Warpdrive as a free, open-source SoftwareApplication", () => {
    expect(SOFTWARE_APPLICATION.name).toBe("Warpdrive");
    expect(SOFTWARE_APPLICATION.applicationCategory).toBe("BusinessApplication");
    expect(SOFTWARE_APPLICATION.isAccessibleForFree).toBe(true);
    expect(SOFTWARE_APPLICATION.offers.price).toBe("0");
    expect(SOFTWARE_APPLICATION.url).toBe("https://warpdrivecrm.com");
  });

  it("links the software and organization to the GitHub repo and the OpenAlternative listing", () => {
    for (const node of [SOFTWARE_APPLICATION, ORGANIZATION]) {
      expect(node.sameAs).toContain(LANDING_STRINGS.hero.ctaHref);
      expect(node.sameAs).toContain(OPENALTERNATIVE_URL);
    }
  });

  it("keeps the product summary as the software description, independent of the hero copy", () => {
    expect(SOFTWARE_APPLICATION.description).toBe(
      "Warpdrive is an open-source, self-hosted Pipedrive alternative for business-development teams: pipeline management, a deal workspace, contacts, two-way Gmail, and an MCP server for AI assistants, running entirely on your own infrastructure.",
    );
    expect(SOFTWARE_APPLICATION.description).toBe(PRODUCT_SUMMARY);
    expect(LANDING_STRINGS.hero.subtitle).not.toBe(PRODUCT_SUMMARY);
  });

  it("stamps the latest release version and date onto the software node", () => {
    const node = softwareNode(buildStructuredData({ version: "1.4.0", releasedOn: "2026-10-30" }));
    expect(node.softwareVersion).toBe("1.4.0");
    expect(node.dateModified).toBe("2026-10-30");
  });

  it("omits the version fields when no release is known", () => {
    const node = softwareNode(buildStructuredData(null));
    expect(node).not.toHaveProperty("softwareVersion");
    expect(node).not.toHaveProperty("dateModified");
  });

  it("mirrors every FAQ item into a FAQPage question with its answer", () => {
    expect(FAQ_PAGE.mainEntity).toHaveLength(LANDING_STRINGS.faq.items.length);
    for (const item of LANDING_STRINGS.faq.items) {
      const question = FAQ_PAGE.mainEntity.find((q) => q.name === item.q);
      expect(question?.acceptedAnswer.text).toBe(item.a);
    }
  });

  it("answers the MCP and Pipedrive import questions in the FAQ", () => {
    const questions = LANDING_STRINGS.faq.items.map((item) => item.q).join("\n");
    expect(questions).toMatch(/import.*Pipedrive/i);
    expect(questions).toMatch(/Claude|ChatGPT|AI assistant/);
  });
});
