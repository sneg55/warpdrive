import { ATOMIC_CRM_PAGE } from "../sitePages";
import { type Competitor, comparisonDisclaimer, WARPDRIVE } from "./types";

export const atomicCrm: Competitor = {
  slug: "atomic-crm",
  page: ATOMIC_CRM_PAGE,
  name: "Atomic CRM",
  heading: "Warpdrive vs Atomic CRM",
  summary:
    "Warpdrive and Atomic CRM are both MIT-licensed open-source CRMs written in TypeScript and React on Postgres. Warpdrive is a complete Pipedrive alternative you run as one Docker Compose stack, with two-way Gmail over the Gmail API, a built-in Pipedrive importer, and an MCP server for AI assistants. Atomic CRM, from marmelab, is built on shadcn-admin-kit and Supabase and is designed to be customized and forked, with inbound email captured as contact notes.",
  rows: [
    { label: "License", warpdrive: WARPDRIVE.license, competitor: "MIT" },
    {
      label: "Focus",
      warpdrive: WARPDRIVE.focus,
      competitor: "A full-featured CRM designed to be customized and forked",
    },
    {
      label: "Self-hosting",
      warpdrive: WARPDRIVE.selfHost,
      competitor: "Supabase backend, hosted or self-hosted, plus a static frontend on any host",
    },
    { label: "Hosted plan", warpdrive: WARPDRIVE.hosted, competitor: "None, you deploy it yourself" },
    {
      label: "Stack",
      warpdrive: WARPDRIVE.stack,
      competitor: "TypeScript, React, Vite, shadcn/ui, Supabase (Postgres)",
    },
    {
      label: "Email",
      warpdrive: WARPDRIVE.email,
      competitor: "Inbound capture through Postmark: mail forwarded or Bcc'd is saved as a contact note",
    },
    { label: "Pipeline view", warpdrive: WARPDRIVE.board, competitor: "Kanban board for deals" },
  ],
  chooseWarpdrive: [
    "You want two-way Gmail sync, not just inbound capture.",
    "You want one Docker Compose stack instead of a Supabase project.",
    "You are leaving Pipedrive and want its CSV exports imported directly.",
    "You want Claude, ChatGPT, or Cursor working in the CRM over MCP, under each user's permissions.",
  ],
  chooseCompetitor: [
    "You want a small codebase to fork and reshape as your own CRM.",
    "You already build on Supabase.",
    "You need single sign-on through Azure, Keycloak, or Auth0 as well as Google.",
  ],
  faq: [
    {
      q: "What is the difference between Warpdrive and Atomic CRM?",
      a: "Both are MIT-licensed TypeScript and React CRMs on Postgres. Warpdrive is a ready-to-run Pipedrive alternative with two-way Gmail and a Pipedrive importer. Atomic CRM is a customizable starting point built on shadcn-admin-kit and Supabase, meant to be forked.",
    },
    {
      q: "Does Atomic CRM sync with Gmail?",
      a: "Atomic CRM captures inbound email through Postmark: forward or Bcc a message to your inbound address and it is saved as a note on the contact. Warpdrive syncs Gmail two ways over the Gmail API and links threads to deals and people.",
    },
    {
      q: "How do you deploy Atomic CRM compared with Warpdrive?",
      a: "Atomic CRM deploys as a Supabase backend, on Supabase.com or self-hosted, with a static frontend on any host. Warpdrive deploys as one Docker Compose file on your own server, with Postgres and Garage included.",
    },
  ],
  sources: [
    { label: "Atomic CRM license", href: "https://github.com/marmelab/atomic-crm/blob/main/LICENSE.md" },
    { label: "Atomic CRM documentation", href: "https://marmelab.com/atomic-crm/doc/" },
    { label: "Atomic CRM deployment", href: "https://marmelab.com/atomic-crm/doc/developers/deploy/" },
    { label: "Atomic CRM inbound email", href: "https://marmelab.com/atomic-crm/doc/users/inbound-email/" },
  ],
  disclaimer: comparisonDisclaimer("Atomic CRM"),
};
