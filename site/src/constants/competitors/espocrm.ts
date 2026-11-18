import { ESPOCRM_PAGE } from "../sitePages";
import { type Competitor, comparisonDisclaimer, WARPDRIVE } from "./types";

export const espocrm: Competitor = {
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
      warpdrive: WARPDRIVE.stack,
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
  faq: [
    {
      q: "What is the main difference between Warpdrive and EspoCRM?",
      a: "Warpdrive is a focused Pipedrive alternative for business-development pipelines, written in TypeScript on Postgres. EspoCRM is a general-purpose CRM written in PHP that runs on MySQL, MariaDB, or PostgreSQL.",
    },
    {
      q: "Do Warpdrive and EspoCRM both integrate with Gmail?",
      a: "Warpdrive syncs Gmail two ways over the Gmail API and links threads to deals and people. EspoCRM connects IMAP and SMTP mailboxes, with Gmail OAuth available through its Google Integration extension.",
    },
    {
      q: "Is EspoCRM workflow automation free?",
      a: "EspoCRM sells workflows, BPM, and reports in its paid Advanced Pack extension. Warpdrive leaves workflow automation out of scope by design.",
    },
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
  disclaimer: comparisonDisclaimer("EspoCRM"),
};
