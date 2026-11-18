import { TWENTY_PAGE } from "../sitePages";
import { type Competitor, comparisonDisclaimer, WARPDRIVE } from "./types";

export const twenty: Competitor = {
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
    { label: "Stack", warpdrive: WARPDRIVE.stack, competitor: "React, TypeScript, Postgres" },
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
  faq: [
    {
      q: "Is Warpdrive or Twenty better for a Pipedrive-style sales pipeline?",
      a: "Warpdrive is built specifically as a Pipedrive alternative: a kanban deal board with weighted stage totals, a deal workspace, two-way Gmail, and a direct importer for Pipedrive CSV exports. Twenty is a general-purpose CRM positioned against Salesforce, with kanban, table, and calendar views and no-code workflows.",
    },
    {
      q: "What licenses do Warpdrive and Twenty use?",
      a: "Warpdrive is MIT-licensed throughout. Twenty is licensed mostly under AGPL-3.0, with some files under a commercial Enterprise license.",
    },
    {
      q: "Can I self-host both Warpdrive and Twenty?",
      a: "Yes. Both run with Docker Compose and Postgres. Warpdrive is self-hosted only, while Twenty also sells a hosted cloud plan billed per user.",
    },
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
  disclaimer: comparisonDisclaimer("Twenty"),
};
