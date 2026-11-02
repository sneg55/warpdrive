import { pageUrl } from "./siteMetadata";
import type { SitePage } from "./sitePages";
import { SOFTWARE_APPLICATION } from "./structuredData";

export function buildWebPageData(page: SitePage) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${pageUrl(page.path)}#webpage`,
    url: pageUrl(page.path),
    name: page.title,
    description: page.description,
    about: { "@id": SOFTWARE_APPLICATION["@id"] },
  } as const;
}
