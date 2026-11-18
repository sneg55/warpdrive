import { KRAYIN_PAGE } from "../sitePages";
import { type Competitor, comparisonDisclaimer, WARPDRIVE } from "./types";

export const krayin: Competitor = {
  slug: "krayin",
  page: KRAYIN_PAGE,
  name: "Krayin CRM",
  heading: "Warpdrive vs Krayin CRM",
  summary:
    "Warpdrive and Krayin CRM are both MIT-licensed, self-hostable open-source CRMs. Warpdrive is a focused Pipedrive alternative built on TypeScript and Postgres, with two-way Gmail over the Gmail API, a built-in Pipedrive importer, and an MCP server for AI assistants. Krayin is a Laravel and Vue.js CRM from Webkul for the full customer lifecycle, with a built-in automation package and a hosted Krayin Cloud option.",
  rows: [
    { label: "License", warpdrive: WARPDRIVE.license, competitor: "MIT" },
    {
      label: "Focus",
      warpdrive: WARPDRIVE.focus,
      competitor: "Customer lifecycle management for SMEs and enterprises",
    },
    {
      label: "Self-hosting",
      warpdrive: WARPDRIVE.selfHost,
      competitor: "Docker image or Docker Compose with MySQL, or a manual PHP install",
    },
    { label: "Hosted plan", warpdrive: WARPDRIVE.hosted, competitor: "Krayin Cloud, run by Webkul" },
    { label: "Stack", warpdrive: WARPDRIVE.stack, competitor: "PHP, Laravel, Vue.js, MySQL" },
    {
      label: "Email",
      warpdrive: WARPDRIVE.email,
      competitor: "Inbound email parsing and IMAP mailboxes",
    },
    { label: "Pipeline view", warpdrive: WARPDRIVE.board, competitor: "Kanban and table views for leads" },
    {
      label: "Workflow automation",
      warpdrive: WARPDRIVE.workflows,
      competitor: "Built-in automation package",
    },
  ],
  chooseWarpdrive: [
    "You want Pipedrive's business-development workflow rather than a general CRM.",
    "Your team is on Google Workspace and wants two-way Gmail over the Gmail API.",
    "You are leaving Pipedrive and want its CSV exports imported directly.",
    "You want Claude, ChatGPT, or Cursor working in the CRM over MCP, under each user's permissions.",
  ],
  chooseCompetitor: [
    "Your team works in PHP and Laravel and wants a modular package base to extend.",
    "You need built-in workflow automation.",
    "You run MySQL rather than Postgres.",
    "You want a hosted option from the maintainers.",
  ],
  faq: [
    {
      q: "Are Warpdrive and Krayin CRM both MIT-licensed?",
      a: "Yes. Both are open source under the MIT license, so you can run, modify, and redistribute either without copyleft obligations.",
    },
    {
      q: "What is the difference between Warpdrive and Krayin CRM?",
      a: "Warpdrive reimplements Pipedrive's business-development workflow in TypeScript on Postgres, with two-way Gmail and a Pipedrive importer. Krayin is a broader customer-lifecycle CRM built on PHP, Laravel, and MySQL, with a built-in automation package.",
    },
    {
      q: "How do I self-host Krayin CRM compared with Warpdrive?",
      a: "Krayin ships a Docker image and a Docker Compose setup with MySQL, or installs manually on a PHP host. Warpdrive ships one Docker Compose file that starts the app, WebSocket server, worker, Postgres, and Garage, with Caddy handling HTTPS.",
    },
  ],
  sources: [
    { label: "Krayin license", href: "https://github.com/krayin/laravel-crm/blob/master/LICENSE" },
    { label: "Krayin CRM", href: "https://krayincrm.com" },
    { label: "Krayin Docker docs", href: "https://devdocs.krayincrm.com/2.0/introduction/docker.html" },
    {
      label: "Krayin automation package",
      href: "https://github.com/krayin/laravel-crm/tree/master/packages/Webkul/Automation",
    },
  ],
  disclaimer: comparisonDisclaimer("Krayin CRM"),
};
