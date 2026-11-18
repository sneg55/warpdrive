import { PIPEDRIVE_PAGE } from "../sitePages";
import { type Competitor, comparisonDisclaimer, WARPDRIVE } from "./types";

export const pipedrive: Competitor = {
  slug: "pipedrive",
  page: PIPEDRIVE_PAGE,
  name: "Pipedrive",
  heading: "Warpdrive vs Pipedrive",
  summary:
    "Warpdrive is a free, open-source, self-hosted alternative to Pipedrive that reimplements its business-development workflow: the kanban deal board, the deal workspace, contacts and organizations, and two-way Gmail. Pipedrive is a proprietary, vendor-hosted sales CRM billed per seat, with built-in automations and a large integrations marketplace. Warpdrive runs on your own server under the MIT license and imports Pipedrive CSV exports directly.",
  rows: [
    { label: "License", warpdrive: WARPDRIVE.license, competitor: "Proprietary, closed source" },
    {
      label: "Focus",
      warpdrive: WARPDRIVE.focus,
      competitor: "Sales pipeline CRM for sales, marketing, and project management",
    },
    { label: "Self-hosting", warpdrive: WARPDRIVE.selfHost, competitor: "None, vendor-hosted only" },
    {
      label: "Hosted plan",
      warpdrive: WARPDRIVE.hosted,
      competitor: "Paid cloud plans, billed per seat, with a free trial",
    },
    {
      label: "Email",
      warpdrive: WARPDRIVE.email,
      competitor: "Gmail, Microsoft 365, Outlook, and Exchange, plus any IMAP account",
    },
    {
      label: "Pipeline view",
      warpdrive: WARPDRIVE.board,
      competitor: "Drag-and-drop kanban board, plus list views",
    },
    {
      label: "Workflow automation",
      warpdrive: WARPDRIVE.workflows,
      competitor: "Built-in Automations, set up by admins",
    },
  ],
  chooseWarpdrive: [
    "You want Pipedrive's pipeline workflow without per-seat billing.",
    "Your customer data has to stay on infrastructure you control.",
    "You want the source code under the MIT license, to read, audit, or change.",
    "You want Claude, ChatGPT, or Cursor working in the CRM over MCP, under each user's permissions.",
  ],
  chooseCompetitor: [
    "You want a hosted CRM and no server to run.",
    "You need Microsoft or Exchange mailboxes as well as Gmail.",
    "You need built-in workflow automation and a marketplace of integrations.",
  ],
  faq: [
    {
      q: "Is Warpdrive a free alternative to Pipedrive?",
      a: "Yes. Warpdrive is MIT-licensed and free to run, with no per-seat pricing: you pay only for the server you host it on. Pipedrive is a paid, vendor-hosted service billed per seat.",
    },
    {
      q: "Can I move my data from Pipedrive to Warpdrive?",
      a: "Yes. Warpdrive imports Pipedrive CSV exports of organizations, people, leads, deals, activities, and notes, keeping owners, links between records, deal status, and won and lost dates. Products, files, email history, and stage history do not come across.",
    },
    {
      q: "What does Pipedrive have that Warpdrive does not?",
      a: "Pipedrive offers a hosted service, Microsoft and Exchange mailbox sync, built-in workflow automations, and an integrations marketplace. Warpdrive is self-hosted only, syncs Gmail, and leaves products, invoicing, forecasts, and workflow automation out of scope by design.",
    },
    {
      q: "Is Warpdrive affiliated with Pipedrive?",
      a: "No. Warpdrive is an independent open-source project that reimplements a Pipedrive-style workflow. It is not affiliated with or endorsed by Pipedrive.",
    },
  ],
  sources: [
    { label: "Pipedrive pricing", href: "https://www.pipedrive.com/en/pricing" },
    { label: "Pipedrive sales pipeline", href: "https://www.pipedrive.com/en/features/sales-pipeline" },
    { label: "Pipedrive email sync", href: "https://support.pipedrive.com/en/article/email-sync" },
    {
      label: "Pipedrive workflow automation",
      href: "https://www.pipedrive.com/en/features/workflow-automation",
    },
  ],
  disclaimer: comparisonDisclaimer("Pipedrive"),
};
