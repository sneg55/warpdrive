// JSON-LD structured data for the marketing site, emitted once in-page by <JsonLd>. This is the
// machine-readable layer search engines and AI answer engines read: what Warpdrive is (a free,
// open-source, self-hosted CRM), who publishes it, and the FAQ answers. Every value derives from
// the same copy constants the page renders, so the schema can never drift from the visible text.
import { LANDING_STRINGS } from "./landingStrings";
import { SITE_URL } from "./siteMetadata";

// The "View on GitHub" CTA already points at the repo; reuse it as the canonical off-site identity.
const REPO_URL = LANDING_STRINGS.hero.ctaHref;
const MIT_LICENSE_URL = "https://opensource.org/licenses/MIT";

interface OfferNode {
  "@type": "Offer";
  price: string;
  priceCurrency: string;
}

interface SoftwareApplicationNode {
  "@type": "SoftwareApplication";
  "@id": string;
  name: string;
  applicationCategory: string;
  applicationSubCategory: string;
  operatingSystem: string;
  description: string;
  url: string;
  downloadUrl: string;
  license: string;
  isAccessibleForFree: true;
  offers: OfferNode;
  featureList: string[];
  sameAs: string[];
  author: { "@id": string };
}

export const SOFTWARE_APPLICATION: SoftwareApplicationNode = {
  "@type": "SoftwareApplication",
  "@id": `${SITE_URL}/#software`,
  name: "Warpdrive",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "CRM",
  operatingSystem: "Docker, Linux, Web",
  description: LANDING_STRINGS.hero.subtitle,
  url: SITE_URL,
  downloadUrl: REPO_URL,
  license: MIT_LICENSE_URL,
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: LANDING_STRINGS.features.items.map((item) => item.title),
  sameAs: [REPO_URL],
  author: { "@id": `${SITE_URL}/#org` },
};

interface OrganizationNode {
  "@type": "Organization";
  "@id": string;
  name: string;
  url: string;
  logo: string;
  sameAs: string[];
}

export const ORGANIZATION: OrganizationNode = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#org`,
  name: "Warpdrive",
  url: SITE_URL,
  logo: `${SITE_URL}/icon.png`,
  sameAs: [REPO_URL],
};

interface QuestionNode {
  "@type": "Question";
  name: string;
  acceptedAnswer: { "@type": "Answer"; text: string };
}

interface FaqPageNode {
  "@type": "FAQPage";
  "@id": string;
  mainEntity: QuestionNode[];
}

export const FAQ_PAGE: FaqPageNode = {
  "@type": "FAQPage",
  "@id": `${SITE_URL}/#faq`,
  mainEntity: LANDING_STRINGS.faq.items.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [SOFTWARE_APPLICATION, ORGANIZATION, FAQ_PAGE],
} as const;
