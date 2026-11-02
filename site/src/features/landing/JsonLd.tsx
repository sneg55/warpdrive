import type { ReactNode } from "react";

export function JsonLd({ data }: { data: object }): ReactNode {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: static, app-authored JSON-LD, no user input
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
