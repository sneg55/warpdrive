import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";

// Documentation site for warpdrive, served at docs.warpdrivecrm.com from its own
// Cloudflare Pages project (`warpdrive-docs`). It builds from the PUBLIC mirror
// sneg55/warpdrive, so every outward-facing link here must point at the mirror and
// never at the private source-of-truth repo.
// Design: docs/superpowers/specs/2026-07-19-docs-site-docusaurus-design.md

const GITHUB_REPO = "https://github.com/sneg55/warpdrive";
const MARKETING_SITE = "https://warpdrivecrm.com";

const config: Config = {
  title: "Warpdrive",
  tagline: "Open-source, self-hosted CRM for business-development teams",
  favicon: "img/favicon.ico",

  future: { v4: true },

  url: "https://docs.warpdrivecrm.com",
  baseUrl: "/",

  // A dead cross-link fails the build rather than shipping. With ~25 pages that
  // cross-reference each other heavily, this is the only thing standing between a
  // single rename and a wall of 404s.
  onBrokenLinks: "throw",

  i18n: { defaultLocale: "en", locales: ["en"] },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          editUrl: `${GITHUB_REPO}/tree/main/docs-site/`,
          // Docs are the whole site: /setup, not /docs/setup.
          routeBasePath: "/",
        },
        blog: false,
        // Same GA property as the marketing site, so docs and landing traffic land in
        // one funnel rather than two disconnected reports.
        gtag: { trackingID: "G-WN9BMJ5QD6", anonymizeIP: true },
        theme: { customCss: "./src/css/custom.css" },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    [
      // Offline search index built at compile time. Chosen over Algolia DocSearch so the
      // site carries no third-party runtime dependency and no API key to provision.
      "@easyops-cn/docusaurus-search-local",
      {
        hashed: true,
        indexBlog: false,
        docsRouteBasePath: "/",
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],

  themeConfig: {
    colorMode: { respectPrefersColorScheme: true },
    image: "img/logo.png",
    navbar: {
      title: "Warpdrive",
      logo: { alt: "Warpdrive logo", src: "img/logo.png" },
      items: [
        { type: "docSidebar", sidebarId: "docs", position: "left", label: "Docs" },
        { href: MARKETING_SITE, label: "Website", position: "right" },
        { href: GITHUB_REPO, label: "GitHub", position: "right" },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Documentation",
          items: [
            { label: "Introduction", to: "/" },
            { label: "Installation", to: "/setup" },
            { label: "Architecture", to: "/architecture" },
          ],
        },
        {
          title: "Features",
          items: [
            { label: "Pipeline", to: "/features/pipeline" },
            { label: "Deal workspace", to: "/features/deal-workspace" },
            { label: "Email", to: "/features/email" },
          ],
        },
        {
          title: "Administration",
          items: [
            { label: "Users and teams", to: "/administration/users-and-teams" },
            { label: "Permission sets", to: "/administration/permission-sets" },
            { label: "Visibility groups", to: "/administration/visibility-groups" },
          ],
        },
        {
          title: "Community",
          items: [
            { label: "Contributing", to: "/contributing" },
            { label: "GitHub", href: GITHUB_REPO },
            { label: "Website", href: MARKETING_SITE },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Warpdrive. Licensed under MIT.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "sql", "json"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
