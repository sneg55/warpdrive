import type { Metadata } from "next";
import { HOME_PAGE, type SitePage } from "./sitePages";
import { STRINGS } from "./strings";

export const SITE_URL = "https://warpdrivecrm.com";

// Google Analytics 4 measurement ID for the marketing site. Loaded via next/script in the root
// layout. Public by design (it ships in the client bundle), so it lives here, not in env.
export const GA_MEASUREMENT_ID = "G-WN9BMJ5QD6";

// Ahrefs Web Analytics site key, loaded via next/script in the root layout alongside gtag. Public
// by design (it ships in the client bundle), so it lives here, not in env. The docs site carries
// the same key via its own `scripts` config so both properties report into one Ahrefs project.
// The `gitleaks:allow` is required: the OSS mirror publish scans with gitleaks, whose
// generic-api-key heuristic reads any high-entropy string next to "key" as a secret. This one is a
// public site identifier, not a credential, so it is annotated rather than moved out of the repo.
export const AHREFS_ANALYTICS_KEY = "aD9VD8YqPwtacLzWcunl9g"; // gitleaks:allow

const SOCIAL_CARD = { url: "/opengraph-image", width: 1200, height: 630, type: "image/png" };

export function pageUrl(path: string): string {
  return path === "/" ? SITE_URL : `${SITE_URL}${path}`;
}

export function pageMetadata(page: SitePage): Metadata {
  const isHome = page.path === "/";
  const url = pageUrl(page.path);
  return {
    metadataBase: new URL(SITE_URL),
    title: page.title,
    description: page.description,
    applicationName: STRINGS.app.name,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      siteName: STRINGS.app.name,
      title: page.title,
      description: page.description,
      ...(isHome ? {} : { images: [SOCIAL_CARD] }),
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
    },
  };
}

export const metadata: Metadata = pageMetadata(HOME_PAGE);
