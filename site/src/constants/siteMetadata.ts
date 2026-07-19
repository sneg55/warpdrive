import type { Metadata } from "next";
import { LANDING_STRINGS } from "./landingStrings";
import { STRINGS } from "./strings";

// Canonical origin for the marketing site. Kept as a constant so the layout, sitemap, and robots
// all agree. Extracted from layout.tsx (which pulls in the next/font macro) so it stays unit-testable.
export const SITE_URL = "https://warpdrivecrm.com";

// Google Analytics 4 measurement ID for the marketing site. Loaded via next/script in the root
// layout. Public by design (it ships in the client bundle), so it lives here, not in env.
export const GA_MEASUREMENT_ID = "G-WN9BMJ5QD6";

const TITLE = `${STRINGS.app.name}, the open-source self-hosted Pipedrive alternative`;
const DESCRIPTION = LANDING_STRINGS.hero.subtitle;

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
    images: [{ url: "/icon.png", width: 512, height: 512, alt: STRINGS.app.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/icon.png"],
  },
};
