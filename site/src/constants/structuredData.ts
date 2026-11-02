import type { ReleaseFacts } from "@/types/repoFacts";
import { LANDING_STRINGS } from "./landingStrings";
import { SITE_URL } from "./siteMetadata";

const REPO_URL = LANDING_STRINGS.hero.ctaHref;
const MIT_LICENSE_URL = "https://opensource.org/licenses/MIT";
export const OPENALTERNATIVE_URL = "https://openalternative.co/warpdrive";
const PROFILES = [REPO_URL, OPENALTERNATIVE_URL];

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
  softwareVersion?: string;
  dateModified?: string;
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
  sameAs: PROFILES,
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
  sameAs: PROFILES,
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

export function buildStructuredData(release: ReleaseFacts | null) {
  const software: SoftwareApplicationNode =
    release === null
      ? SOFTWARE_APPLICATION
      : {
          ...SOFTWARE_APPLICATION,
          softwareVersion: release.version,
          dateModified: release.releasedOn,
        };
  return {
    "@context": "https://schema.org",
    "@graph": [software, ORGANIZATION, FAQ_PAGE],
  } as const;
}
