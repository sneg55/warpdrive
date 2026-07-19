import type { Metadata } from "next";
import { STRINGS } from "./strings";

// Canonical origin for the marketing site. Kept as a constant so the layout, sitemap, and robots
// all agree. Extracted from layout.tsx (which pulls in the next/font macro) so it stays unit-testable.
export const SITE_URL = "https://warpdrivecrm.com";

// Google Analytics 4 measurement ID for the marketing site. Loaded via next/script in the root
// layout. Public by design (it ships in the client bundle), so it lives here, not in env.
export const GA_MEASUREMENT_ID = "G-WN9BMJ5QD6";

const TITLE = `${STRINGS.app.name}, the open-source self-hosted Pipedrive alternative`;

// The SERP/social/AI-card description. Deliberately separate from the (longer, richer) visible hero
// subtitle: Google truncates the snippet near 160 chars, so this is written to fit and front-loads
// the money keywords ("free, open-source, self-hosted Pipedrive alternative").
const DESCRIPTION =
  "Warpdrive is a free, open-source, self-hosted Pipedrive alternative: pipelines, deals, contacts, and two-way Gmail on your own infrastructure.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: STRINGS.app.name,
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: STRINGS.app.name,
    title: TITLE,
    description: DESCRIPTION,
    // The 1200x630 card is generated at build by app/opengraph-image.tsx (file-based metadata), which
    // Next injects as og:image. Twitter/X and AI answer-engine cards fall back to og:image, so there
    // is no separate twitter image. Do not also set images here or the tags duplicate.
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};
