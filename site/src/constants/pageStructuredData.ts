import type { Competitor } from "./competitors";
import { pageUrl } from "./siteMetadata";
import type { SitePage } from "./sitePages";
import { faqPageNode, SOFTWARE_APPLICATION } from "./structuredData";

function webPageNode(page: SitePage) {
  return {
    "@type": "WebPage",
    "@id": `${pageUrl(page.path)}#webpage`,
    url: pageUrl(page.path),
    name: page.title,
    description: page.description,
    dateModified: page.updated,
    about: { "@id": SOFTWARE_APPLICATION["@id"] },
  } as const;
}

export function buildWebPageData(page: SitePage) {
  return { "@context": "https://schema.org", ...webPageNode(page) } as const;
}

export function buildComparisonData(competitor: Competitor) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      webPageNode(competitor.page),
      faqPageNode(`${pageUrl(competitor.page.path)}#faq`, competitor.faq),
    ],
  } as const;
}
