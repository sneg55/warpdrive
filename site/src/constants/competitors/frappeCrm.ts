import { FRAPPE_CRM_PAGE } from "../sitePages";
import { type Competitor, comparisonDisclaimer, WARPDRIVE } from "./types";

export const frappeCrm: Competitor = {
  slug: "frappe-crm",
  page: FRAPPE_CRM_PAGE,
  name: "Frappe CRM",
  heading: "Warpdrive vs Frappe CRM",
  summary:
    "Warpdrive and Frappe CRM are both open-source sales CRMs you can self-host. Warpdrive is a focused, MIT-licensed Pipedrive alternative built on TypeScript and Postgres, with two-way Gmail over the Gmail API, a built-in Pipedrive importer, and an MCP server for AI assistants. Frappe CRM is an AGPL-3.0 app on the Python Frappe framework, aimed at modern sales teams with unlimited users, and also sold as a hosted service on Frappe Cloud.",
  rows: [
    { label: "License", warpdrive: WARPDRIVE.license, competitor: "AGPL-3.0" },
    {
      label: "Focus",
      warpdrive: WARPDRIVE.focus,
      competitor: "Sales CRM for modern sales teams, with unlimited users",
    },
    {
      label: "Self-hosting",
      warpdrive: WARPDRIVE.selfHost,
      competitor: "Easy-install script with Docker, as an app on the Frappe framework",
    },
    {
      label: "Hosted plan",
      warpdrive: WARPDRIVE.hosted,
      competitor: "Frappe Cloud plans, billed monthly and not per user",
    },
    { label: "Stack", warpdrive: WARPDRIVE.stack, competitor: "Python on the Frappe framework, Vue frontend" },
    {
      label: "Email",
      warpdrive: WARPDRIVE.email,
      competitor: "Connected email accounts, including Gmail, for incoming and outgoing mail",
    },
    {
      label: "Pipeline view",
      warpdrive: WARPDRIVE.board,
      competitor: "Drag-and-drop kanban, plus custom list views",
    },
  ],
  chooseWarpdrive: [
    "You want an MIT license rather than AGPL-3.0.",
    "You want a standalone CRM without adopting the Frappe framework.",
    "You are leaving Pipedrive and want its CSV exports imported directly.",
    "You want Claude, ChatGPT, or Cursor working in the CRM over MCP, under each user's permissions.",
  ],
  chooseCompetitor: [
    "You already run Frappe or ERPNext and want the CRM in the same stack.",
    "You want a hosted plan that is not billed per user.",
    "Your team works in Python.",
  ],
  faq: [
    {
      q: "What is the difference between Warpdrive and Frappe CRM?",
      a: "Warpdrive is a standalone Pipedrive alternative written in TypeScript on Postgres, under the MIT license. Frappe CRM is an AGPL-3.0 app that runs on the Python Frappe framework, alongside the rest of the Frappe and ERPNext ecosystem.",
    },
    {
      q: "Do Warpdrive and Frappe CRM charge per user?",
      a: "Neither charges per user. Warpdrive is self-hosted only and free to run. Frappe CRM is free to self-host and also sells Frappe Cloud hosting on monthly plans that are not billed per user.",
    },
    {
      q: "Can I self-host Frappe CRM and Warpdrive with Docker?",
      a: "Yes. Frappe CRM installs with an easy-install script that uses Docker. Warpdrive ships one Docker Compose file that starts the app, WebSocket server, worker, Postgres, and Garage, with Caddy handling HTTPS.",
    },
  ],
  sources: [
    { label: "Frappe CRM license", href: "https://github.com/frappe/crm/blob/develop/LICENSE" },
    { label: "Frappe CRM", href: "https://frappe.io/crm" },
    { label: "Frappe CRM pricing", href: "https://frappe.io/crm/pricing" },
    { label: "Frappe CRM documentation", href: "https://docs.frappe.io/crm" },
  ],
  disclaimer: comparisonDisclaimer("Frappe CRM"),
};
