import type { ReactNode } from "react";
import { STRUCTURED_DATA } from "@/constants/structuredData";

// Emits the site's JSON-LD as a single in-page <script>. Server-rendered into the static export, so
// search engines and AI answer engines get the machine-readable facts with no JS execution. Next.js
// recommends a plain script tag for JSON-LD (its json-ld guide), not next/script.
export function JsonLd(): ReactNode {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: static, app-authored JSON-LD, no user input
      dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
    />
  );
}
