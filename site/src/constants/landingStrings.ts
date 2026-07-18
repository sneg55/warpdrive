// Landing page copy (the marketing surface at /). Same house rule as strings.ts: UI text
// lives in constants, not components, so a future locale layer is a drop-in. No em dashes.
// Positioning and feature details follow the public README (oss/overlay/README.md).
export const LANDING_STRINGS = {
  nav: {
    logoAlt: "Warpdrive logo",
    features: "Features",
    tour: "Tour",
    compare: "Warpdrive vs Pipedrive",
    github: "GitHub",
    githubStarsSuffix: "stars",
    skipToContent: "Skip to content",
  },
  hero: {
    badge: "Open source · Self-hosted · MIT licensed",
    title: "Your pipeline. Your infrastructure.",
    subtitle:
      "Warpdrive is an open-source, self-hosted Pipedrive alternative for business-development teams: pipeline management, a deal workspace, contacts, and two-way Gmail, running entirely on your own infrastructure.",
    cta: "View on GitHub",
    ctaHref: "https://github.com/sneg55/warpdrive",
    note: "No per-seat bill. Your customer data never leaves your infrastructure.",
    shotAlt: "Warpdrive pipeline board",
  },
  features: {
    heading: "Everything a BD team needs",
    sub: "The core business development workflow, without the SaaS meter running.",
    items: [
      {
        icon: "kanban",
        title: "Pipeline board",
        body: "Drag deals across stages with per-stage weighted totals, rotting-deal indicators, and saved filters.",
      },
      {
        icon: "briefcase",
        title: "Deal workspace",
        body: "Activities, notes, files, email, and the full change history in one unified timeline.",
      },
      {
        icon: "users",
        title: "Contacts and organizations",
        body: "Custom fields, organization firmographics, a leads inbox, and CSV import with an undo step.",
      },
      {
        icon: "mail",
        title: "Two-way Gmail",
        body: "Thread linking to deals and people, open and click tracking, templates, and scheduled send.",
      },
      {
        icon: "zap",
        title: "Realtime by default",
        body: "Live board moves, notifications, mentions, and presence over your own WebSocket server.",
      },
      {
        icon: "shield",
        title: "Permissions and stats",
        body: "Role-based visibility, teams, and funnel and activity performance stats.",
      },
    ],
  },
  tour: {
    heading: "See it working",
    sub: "Real screens from a running instance, no mockups.",
    items: [
      {
        image: "deal",
        title: "Deal workspace",
        caption:
          "Every activity, note, file, and email on one timeline, with the full change history.",
        alt: "Warpdrive deal workspace",
      },
      {
        image: "inbox",
        title: "Inbox",
        caption: "Two-way Gmail with thread linking, follow-up labels, and unread state.",
        alt: "Warpdrive email inbox",
      },
      {
        image: "contacts",
        title: "Contacts",
        caption: "People and organizations with custom fields, labels, and linked deal counts.",
        alt: "Warpdrive contacts",
      },
    ],
  },
  comparison: {
    heading: "Warpdrive vs Pipedrive",
    sub: "The core BD loop, self-hosted and free. The rest is deliberately out of scope.",
    warpdriveCol: "Warpdrive",
    pipedriveCol: "Pipedrive",
    rows: [
      { label: "License", warpdrive: "MIT, open source", pipedrive: "Proprietary" },
      { label: "Hosting", warpdrive: "Self-hosted, single-tenant", pipedrive: "Vendor cloud" },
      {
        label: "Pricing",
        warpdrive: "Free, your infrastructure only",
        pipedrive: "Paid, per seat",
      },
      {
        label: "Your data",
        warpdrive: "Stays on your infrastructure",
        pipedrive: "Vendor servers",
      },
    ],
    covered:
      "Covered: kanban pipelines, deal workspace, contacts with custom fields, leads inbox with CSV import, two-way Gmail with tracking, permissions, saved filters, notifications, basic stats.",
    outOfScope:
      "Out of scope by design: products, invoicing, forecasts, workflow automation, web forms, marketplace, native mobile apps.",
    disclaimer: "Warpdrive is not affiliated with or endorsed by Pipedrive.",
  },
  selfHost: {
    heading: "One box. docker compose up.",
    body: "The whole topology ships as a single Docker Compose file: app, WebSocket server, background worker, Postgres, and MinIO, with Caddy provisioning HTTPS for your domain automatically. Databases and storage stay on the internal network.",
    bullets: [
      "Google Workspace SSO and Gmail OAuth: your accounts, your consent screen",
      "Postgres LISTEN/NOTIFY realtime, no paid pub-sub",
      "MinIO or any S3-compatible store for files",
    ],
    terminalTitle: "terminal",
    code: [
      { text: "cp .env.example .env", comment: "domain, Google OAuth, secrets" },
      { text: "docker compose up -d --build", comment: null },
    ],
    stackLabel: "Built on",
    stack: [
      "Next.js",
      "React",
      "TypeScript",
      "Postgres",
      "Drizzle",
      "tRPC",
      "Tailwind",
      "shadcn/ui",
    ],
  },
  shot: {
    enlargeLabel: "Enlarge screenshot",
  },
  footer: {
    heading: "Run your pipeline on your own terms.",
    sub: "Spin it up on a spare box and import your first CSV the same afternoon.",
    bottom: "Open source · MIT licensed",
  },
} as const;
