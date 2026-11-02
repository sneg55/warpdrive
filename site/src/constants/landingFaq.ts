export const LANDING_FAQ = {
  heading: "Frequently asked questions",
  sub: "Straight answers about what Warpdrive is, what it costs, and how to run it.",
  items: [
    {
      q: "What is Warpdrive?",
      a: "Warpdrive is an open-source, self-hosted CRM for business-development teams and a free alternative to Pipedrive. It covers pipeline management, a deal workspace, contacts and organizations, two-way Gmail, permissions, stats, Pipedrive import, and an MCP server for AI assistants, and it runs entirely on your own infrastructure under the MIT license.",
    },
    {
      q: "Is Warpdrive free?",
      a: "Yes. Warpdrive is MIT-licensed and free to run. There is no per-seat pricing and no vendor subscription: you pay only for the server you host it on.",
    },
    {
      q: "How do I self-host Warpdrive?",
      a: "Warpdrive ships as a single Docker Compose file. Copy .env.example to .env, set your domain and Google OAuth, then run docker compose up -d --build. That starts the app, WebSocket server, background worker, Postgres, and MinIO, with Caddy provisioning HTTPS for your domain automatically.",
    },
    {
      q: "Can I import my data from Pipedrive?",
      a: "Yes. Warpdrive reads Pipedrive's CSV exports directly. Export organizations, people, leads, deals, activities, and notes as CSV with the ID column, then import them in that order with Pipedrive export as the source. Owners, links between records, deal status, and won and lost dates are kept, and re-running a file skips rows already imported. Products, files, email history, and stage history do not come across.",
    },
    {
      q: "Can Claude or ChatGPT work with my Warpdrive data?",
      a: "Yes. Warpdrive includes an MCP (Model Context Protocol) server, so AI assistants such as Claude, ChatGPT, and Cursor can search deals, leads, people, and activities, log activities, update records, and prepare email drafts. Clients connect over OAuth through your Google sign-in, every call runs under your own permissions, and the server has no tools for deleting CRM records or sending email.",
    },
    {
      q: "Does Warpdrive have two-way Gmail sync?",
      a: "Yes. Warpdrive connects to Gmail over OAuth and links threads to deals and people in both directions. It supports open and click tracking, templates, scheduled send, and follow-up labels, using your own Google Workspace accounts and consent screen.",
    },
    {
      q: "How is Warpdrive different from Pipedrive?",
      a: "Warpdrive is open source (MIT), self-hosted, and free, and your customer data never leaves your infrastructure. Pipedrive is proprietary, vendor-hosted, and billed per seat. Warpdrive focuses on the core business-development loop and leaves products, invoicing, forecasts, and workflow automation deliberately out of scope.",
    },
    {
      q: "What is Warpdrive built on?",
      a: "Warpdrive is built on Next.js, React, and TypeScript, with Postgres and Drizzle, tRPC, Tailwind, and shadcn/ui. Realtime runs on a self-hosted WebSocket server with Postgres LISTEN/NOTIFY, and files are stored in MinIO or any S3-compatible store.",
    },
    {
      q: "Who is Warpdrive for?",
      a: "Warpdrive is built for business-development and sales teams that want to own their pipeline and their data, run on their own infrastructure, and avoid per-seat SaaS billing.",
    },
    {
      q: "Is Warpdrive affiliated with Pipedrive?",
      a: "No. Warpdrive is an independent open-source project and is not affiliated with or endorsed by Pipedrive. Pipedrive is used only as a point of comparison.",
    },
  ],
} as const;
