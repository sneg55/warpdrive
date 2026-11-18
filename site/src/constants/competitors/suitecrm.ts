import { SUITECRM_PAGE } from "../sitePages";
import { type Competitor, comparisonDisclaimer, WARPDRIVE } from "./types";

export const suitecrm: Competitor = {
  slug: "suitecrm",
  page: SUITECRM_PAGE,
  name: "SuiteCRM",
  heading: "Warpdrive vs SuiteCRM",
  summary:
    "Warpdrive and SuiteCRM are both open-source CRMs you can self-host. Warpdrive is a focused, MIT-licensed Pipedrive alternative built on TypeScript and Postgres, with two-way Gmail over the Gmail API, a built-in Pipedrive importer, and an MCP server for AI assistants. SuiteCRM is a broad, enterprise-oriented CRM under AGPL-3.0, built on PHP and Symfony with an Angular frontend, with a workflow module and hosted plans from its maintainers.",
  rows: [
    { label: "License", warpdrive: WARPDRIVE.license, competitor: "AGPL-3.0" },
    { label: "Focus", warpdrive: WARPDRIVE.focus, competitor: "Enterprise-ready, general-purpose CRM" },
    {
      label: "Self-hosting",
      warpdrive: WARPDRIVE.selfHost,
      competitor: "Pre-built package on a LAMP stack, with a web or command-line installer",
    },
    {
      label: "Hosted plan",
      warpdrive: WARPDRIVE.hosted,
      competitor: "SuiteCRM Hosted plans, billed monthly or annually, with no per-user license fees",
    },
    { label: "Stack", warpdrive: WARPDRIVE.stack, competitor: "PHP and Symfony, Angular frontend, MySQL" },
    {
      label: "Email",
      warpdrive: WARPDRIVE.email,
      competitor: "IMAP inbound and SMTP outbound, with OAuth for Microsoft 365 and Google Workspace",
    },
    {
      label: "Workflow automation",
      warpdrive: WARPDRIVE.workflows,
      competitor: "Workflow module that triggers actions on conditions in any module",
    },
  ],
  chooseWarpdrive: [
    "You want a focused, kanban-first deal pipeline rather than an enterprise suite.",
    "You want an MIT license rather than AGPL-3.0.",
    "You are leaving Pipedrive and want its CSV exports imported directly.",
    "You want Claude, ChatGPT, or Cursor working in the CRM over MCP, under each user's permissions.",
  ],
  chooseCompetitor: [
    "You need a broad enterprise feature set with workflows and reporting.",
    "You run PHP on a LAMP stack already.",
    "You want a hosted plan from the maintainers that is not billed per user.",
  ],
  faq: [
    {
      q: "What is the difference between Warpdrive and SuiteCRM?",
      a: "Warpdrive is a focused Pipedrive alternative for business-development pipelines, written in TypeScript on Postgres under the MIT license. SuiteCRM is a broad, enterprise-oriented CRM under AGPL-3.0, built on PHP and Symfony with an Angular frontend and MySQL.",
    },
    {
      q: "How does email work in SuiteCRM compared with Warpdrive?",
      a: "SuiteCRM connects mailboxes over IMAP and SMTP, with OAuth for Microsoft 365 and Google Workspace. Warpdrive syncs Gmail two ways over the Gmail API, with open and click tracking, templates, and scheduled send.",
    },
    {
      q: "Does SuiteCRM have workflow automation?",
      a: "Yes. SuiteCRM has a workflow module that triggers actions when conditions match in any module. Warpdrive leaves workflow automation out of scope by design.",
    },
  ],
  sources: [
    {
      label: "SuiteCRM license",
      href: "https://github.com/salesagility/SuiteCRM-Core/blob/hotfix/LICENSE.txt",
    },
    { label: "SuiteCRM", href: "https://suitecrm.com" },
    { label: "SuiteCRM Hosted", href: "https://suitecrm.com/suitecrmhosted/" },
    {
      label: "SuiteCRM installation guide",
      href: "https://docs.suitecrm.com/8.x/admin/installation-guide/",
    },
    { label: "SuiteCRM email setup", href: "https://docs.suitecrm.com/8.x/user/daily-activities/email-setup/" },
    {
      label: "SuiteCRM workflows",
      href: "https://docs.suitecrm.com/admin/administration-panel/workflow/",
    },
  ],
  disclaimer: comparisonDisclaimer("SuiteCRM"),
};
