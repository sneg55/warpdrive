import { LANDING_COMPARISON } from "./landingComparison";
import { LANDING_FAQ } from "./landingFaq";
import { LANDING_SELF_HOST } from "./landingSelfHost";
import { DOCS_URL, REPO_URL } from "./urls";

export const PRODUCT_SUMMARY =
  "Warpdrive is an open-source, self-hosted Pipedrive alternative for business-development teams: pipeline management, a deal workspace, contacts, two-way Gmail, and an MCP server for AI assistants, running entirely on your own infrastructure.";

const INSTALL_GUIDE = { label: "Read the install guide", href: `${DOCS_URL}/setup/` } as const;

export const LANDING_STRINGS = {
  nav: {
    logoAlt: "Warpdrive logo",
    features: "Features",
    featuresHref: "/#features",
    tour: "Tour",
    tourHref: "/#tour",
    compare: "Compare",
    compareHref: "/#compare",
    docs: "Docs",
    docsHref: DOCS_URL,
    github: "GitHub",
    githubStarsSuffix: "stars",
    skipToContent: "Skip to content",
  },
  hero: {
    badge: "Open source · Self-hosted · MIT licensed",
    title: "The open-source, self-hosted Pipedrive alternative",
    tagline: "Your pipeline. Your infrastructure.",
    subtitle:
      "Pipelines, deals, contacts, and two-way Gmail for business-development teams. Bring your Pipedrive CSV exports across, then let Claude or ChatGPT work the pipeline over MCP, with no tools to delete records or send email.",
    cta: "View on GitHub",
    ctaHref: REPO_URL,
    installCta: INSTALL_GUIDE.label,
    installHref: INSTALL_GUIDE.href,
    note: "No per-seat bill. Your customer data never leaves your infrastructure.",
    shotAlt: "Warpdrive pipeline board",
    releasePrefix: "Latest release",
    releaseTagHref: `${REPO_URL}/releases/tag/v`,
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
      {
        icon: "bot",
        title: "AI assistants over MCP",
        body: "Connect Claude, ChatGPT, or Cursor through an OAuth-protected MCP server that acts under your own permissions, with no delete or send tools.",
      },
      {
        icon: "import",
        title: "Migrate from Pipedrive",
        body: "Import Pipedrive CSV exports of organizations, people, leads, deals, activities, and notes, with owners and links kept.",
      },
    ],
    highlightIcons: ["bot", "import"],
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
  comparison: LANDING_COMPARISON,
  selfHost: LANDING_SELF_HOST,
  faq: LANDING_FAQ,
  shot: {
    enlargeLabel: "Enlarge screenshot",
  },
  footer: {
    heading: "Run your pipeline on your own terms.",
    sub: "Spin it up on a spare box and import your first CSV the same afternoon.",
    bottom: "Open source · MIT licensed",
    groups: [
      {
        label: "Compare",
        links: [
          { label: "Warpdrive vs Pipedrive", href: "/vs/pipedrive" },
          { label: "Warpdrive vs Twenty", href: "/vs/twenty" },
          { label: "Warpdrive vs EspoCRM", href: "/vs/espocrm" },
          { label: "Warpdrive vs Krayin CRM", href: "/vs/krayin" },
          { label: "Warpdrive vs Frappe CRM", href: "/vs/frappe-crm" },
          { label: "Warpdrive vs Atomic CRM", href: "/vs/atomic-crm" },
          { label: "Warpdrive vs SuiteCRM", href: "/vs/suitecrm" },
        ],
      },
      {
        label: "Resources",
        links: [
          { label: "Migrate from Pipedrive", href: "/migrate-from-pipedrive" },
          { label: "Documentation", href: DOCS_URL },
          { label: "Install guide", href: INSTALL_GUIDE.href },
          { label: "Source on GitHub", href: REPO_URL },
        ],
      },
    ],
  },
} as const;
