import type { SitePage } from "../sitePages";

export const COMPARISON_AS_OF = "November 2026";

export const WARPDRIVE = {
  license: "MIT",
  focus: "Pipedrive-style business-development pipeline",
  selfHost:
    "One Docker Compose file: app, WebSocket server, worker, Postgres, and Garage, with Caddy for HTTPS",
  hosted: "None, self-hosted only",
  stack: "Next.js, React, TypeScript, Postgres",
  email:
    "Two-way Gmail over the Gmail API, with open and click tracking, templates, and scheduled send",
  board: "Kanban board with per-stage weighted totals and rotting-deal indicators",
  workflows: "Out of scope by design",
} as const;

export type CompetitorSlug =
  | "pipedrive"
  | "twenty"
  | "espocrm"
  | "krayin"
  | "frappe-crm"
  | "atomic-crm"
  | "suitecrm";

export interface FaqItem {
  q: string;
  a: string;
}

export interface Competitor {
  slug: CompetitorSlug;
  page: SitePage;
  name: string;
  heading: string;
  summary: string;
  rows: ReadonlyArray<{ label: string; warpdrive: string; competitor: string }>;
  chooseWarpdrive: readonly string[];
  chooseCompetitor: readonly string[];
  faq: readonly FaqItem[];
  sources: ReadonlyArray<{ label: string; href: string }>;
  disclaimer: string;
}

export function comparisonDisclaimer(name: string): string {
  return `Warpdrive is not affiliated with or endorsed by ${name}. Details about ${name} come from its public pages as of ${COMPARISON_AS_OF}; check the sources for current terms.`;
}
