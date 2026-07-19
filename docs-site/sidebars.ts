import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

// Information architecture for docs.warpdrivecrm.com.
// Administration is split out of Features deliberately: warpdrive has 15 settings
// routes and a real permissions model, so permission sets and visibility groups each
// carry enough behavior to earn their own page.
// Design: docs/superpowers/specs/2026-07-19-docs-site-docusaurus-design.md
const sidebars: SidebarsConfig = {
  docs: [
    "intro",
    "setup",
    "architecture",
    {
      type: "category",
      label: "Features",
      collapsed: false,
      items: [
        "features/pipeline",
        "features/deal-workspace",
        "features/leads",
        "features/contacts",
        "features/activities",
        "features/email",
        "features/import",
        "features/dashboard",
        "features/notifications",
        "features/search",
        "features/saved-filters",
        "features/collaboration",
        "features/files",
      ],
    },
    {
      type: "category",
      label: "Administration",
      collapsed: false,
      items: [
        "administration/users-and-teams",
        "administration/permission-sets",
        "administration/visibility-groups",
        "administration/company-settings",
        "administration/data-fields",
        "administration/email-sync",
      ],
    },
    {
      type: "category",
      label: "Operations",
      collapsed: false,
      items: ["operations/updating"],
    },
    "contributing",
  ],
};

export default sidebars;
