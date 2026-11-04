import { ESPOCRM_PAGE, type SitePage, TWENTY_PAGE } from "./sitePages";

export const COMPARISON_AS_OF = "November 2026";

const WARPDRIVE = {
  license: "MIT",
  focus: "Pipedrive-style business-development pipeline",
  selfHost:
    "One Docker Compose file: app, WebSocket server, worker, Postgres, and Garage, with Caddy for HTTPS",
  hosted: "None, self-hosted only",
  email:
    "Two-way Gmail over the Gmail API, with open and click tracking, templates, and scheduled send",
  board: "Kanban board with per-stage weighted totals and rotting-deal indicators",
  workflows: "Out of scope by design",
} as const;

export type CompetitorSlug = "twenty" | "espocrm";

export interface Competitor {
  slug: CompetitorSlug;
  page: SitePage;
  name: string;
  heading: string;
  summary: string;
  rows: ReadonlyArray<{ label: string; warpdrive: string; competitor: string }>;
  chooseWarpdrive: readonly string[];
  chooseCompetitor: readonly string[];
  sources: ReadonlyArray<{ label: string; href: string }>;
  disclaimer: string;
}

const twenty: Competitor = {
  slug: "twenty",
  page: TWENTY_PAGE,
  name: "Twenty",
  heading: "Warpdrive vs Twenty",
  summary:
    "Warpdrive and Twenty are both open-source, self-hostable CRMs built with TypeScript, React, and Postgres. Warpdrive is a focused, MIT-licensed Pipedrive alternative for business-development pipelines, with a built-in Pipedrive importer and an MCP server for AI assistants. Twenty is a broader CRM, positioned as an open alternative to Salesforce, licensed mostly under AGPL-3.0 and offered as a paid cloud service as well as self-hosted.",
  rows: [
    {
      label: "License",
      warpdrive: WARPDRIVE.license,
      competitor: "AGPL-3.0, with some files under a commercial Enterprise license",
    },
    {
      label: "Focus",
      warpdrive: WARPDRIVE.focus,
      competitor: "General-purpose CRM, positioned as an open alternative to Salesforce",
    },
    { label: "Self-hosting", warpdrive: WARPDRIVE.selfHost, competitor: "Docker Compose with Postgres" },
    { label: "Hosted plan", warpdrive: WARPDRIVE.hosted, competitor: "Paid cloud plans, billed per user" },
    {
      label: "Stack",
      warpdrive: "Next.js, React, TypeScript, Postgres",
      competitor: "React, TypeScript, Postgres",
    },
    {
      label: "Email",
      warpdrive: WARPDRIVE.email,
      competitor: "Google and Microsoft email and calendar sync",
    },
    { label: "Pipeline view", warpdrive: WARPDRIVE.board, competitor: "Kanban, table, and calendar views" },
    { label: "Workflow automation", warpdrive: WARPDRIVE.workflows, competitor: "No-code workflows" },
  ],
  chooseWarpdrive: [
    "You want Pipedrive's business-development workflow rather than a general CRM.",
    "You want an MIT license with no commercial-license files.",
    "You are leaving Pipedrive and want its CSV exports imported directly.",
    "You want Claude, ChatGPT, or Cursor working in the CRM over MCP, under each user's permissions.",
  ],
  chooseCompetitor: [
    "You need built-in workflow automation.",
    "Your team uses Microsoft email and calendars.",
    "You would rather pay for a hosted plan than run a server.",
  ],
  sources: [
    { label: "Twenty license", href: "https://github.com/twentyhq/twenty/blob/main/LICENSE" },
    { label: "Twenty pricing", href: "https://twenty.com/pricing" },
    {
      label: "Twenty Docker Compose guide",
      href: "https://docs.twenty.com/developers/self-hosting/docker-compose",
    },
    { label: "Twenty documentation", href: "https://docs.twenty.com" },
  ],
  disclaimer: `Warpdrive is not affiliated with or endorsed by Twenty. Details about Twenty come from its public pages as of ${COMPARISON_AS_OF}; check the sources for current terms.`,
};

const espocrm: Competitor = {
  slug: "espocrm",
  page: ESPOCRM_PAGE,
  name: "EspoCRM",
  heading: "Warpdrive vs EspoCRM",
  summary:
    "Warpdrive and EspoCRM are both open-source CRMs you can self-host with Docker Compose. Warpdrive is a focused, MIT-licensed Pipedrive alternative built on TypeScript and Postgres, with two-way Gmail over the Gmail API, a built-in Pipedrive importer, and an MCP server for AI assistants. EspoCRM is a general-purpose PHP CRM under AGPL-3.0, with workflows and BPM sold in its paid Advanced Pack extension.",
  rows: [
    {
      label: "License",
      warpdrive: WARPDRIVE.license,
      competitor: "AGPL-3.0, with workflows, BPM, and reports in the paid Advanced Pack extension",
    },
    { label: "Focus", warpdrive: WARPDRIVE.focus, competitor: "General-purpose CRM" },
    {
      label: "Self-hosting",
      warpdrive: WARPDRIVE.selfHost,
      competitor: "Docker Compose, an install script, or any PHP host",
    },
    { label: "Hosted plan", warpdrive: WARPDRIVE.hosted, competitor: "Paid cloud plans, billed per user" },
    {
      label: "Stack",
      warpdrive: "Next.js, React, TypeScript, Postgres",
      competitor: "PHP with MySQL, MariaDB, or PostgreSQL",
    },
    {
      label: "Email",
      warpdrive: WARPDRIVE.email,
      competitor: "IMAP and SMTP mailboxes, with Gmail OAuth through the Google Integration extension",
    },
    { label: "Pipeline view", warpdrive: WARPDRIVE.board, competitor: "Kanban view for pipelines" },
    {
      label: "Workflow automation",
      warpdrive: WARPDRIVE.workflows,
      competitor: "Workflows in the paid Advanced Pack extension",
    },
  ],
  chooseWarpdrive: [
    "You want Pipedrive's business-development workflow rather than a general CRM.",
    "Your team is on Google Workspace and wants Gmail over the Gmail API, not IMAP.",
    "You are leaving Pipedrive and want its CSV exports imported directly.",
    "You want Claude, ChatGPT, or Cursor working in the CRM over MCP, under each user's permissions.",
  ],
  chooseCompetitor: [
    "You need workflows or BPM and are fine buying the Advanced Pack.",
    "You already run PHP hosting, or need MySQL or MariaDB.",
    "You need mailboxes from providers other than Gmail.",
    "You would rather pay for a hosted plan than run a server.",
  ],
  sources: [
    { label: "EspoCRM license", href: "https://github.com/espocrm/espocrm/blob/master/LICENSE.txt" },
    { label: "EspoCRM pricing", href: "https://www.espocrm.com/pricing/" },
    {
      label: "EspoCRM Docker installation",
      href: "https://docs.espocrm.com/administration/docker/installation/",
    },
    { label: "EspoCRM workflows", href: "https://docs.espocrm.com/administration/workflows/" },
    {
      label: "EspoCRM Gmail integration",
      href: "https://docs.espocrm.com/extensions/google-integration/gmail/",
    },
    {
      label: "EspoCRM server requirements",
      href: "https://docs.espocrm.com/administration/server-configuration/",
    },
  ],
  disclaimer: `Warpdrive is not affiliated with or endorsed by EspoCRM. Details about EspoCRM come from its public pages as of ${COMPARISON_AS_OF}; check the sources for current terms.`,
};

export const COMPETITORS = { twenty, espocrm } as const satisfies Record<CompetitorSlug, Competitor>;
