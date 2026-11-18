export interface SitePage {
  path: string;
  title: string;
  description: string;
  updated: string;
}

const COMPARISONS_UPDATED = "2026-11-18";

function comparisonPage(slug: string, name: string, description: string): SitePage {
  return {
    path: `/vs/${slug}`,
    title: `Warpdrive vs ${name}: open-source CRM comparison`,
    description,
    updated: COMPARISONS_UPDATED,
  };
}

export const HOME_PAGE: SitePage = {
  path: "/",
  title: "Warpdrive, the open-source self-hosted Pipedrive alternative",
  description:
    "Warpdrive is a free, open-source, self-hosted Pipedrive alternative: pipelines, deals, contacts, and two-way Gmail on your own infrastructure.",
  updated: "2026-11-18",
};

export const PIPEDRIVE_PAGE: SitePage = {
  ...comparisonPage(
    "pipedrive",
    "Pipedrive",
    "Warpdrive vs Pipedrive: an open-source, self-hosted Pipedrive alternative compared on license, hosting, email, pipelines, and migration, with sources.",
  ),
  title: "Warpdrive vs Pipedrive: open-source Pipedrive alternative",
};

export const TWENTY_PAGE = comparisonPage(
  "twenty",
  "Twenty",
  "Warpdrive vs Twenty: license, self-hosting, email, pipelines, and workflows compared, with sources, for teams choosing an open-source CRM.",
);

export const ESPOCRM_PAGE = comparisonPage(
  "espocrm",
  "EspoCRM",
  "Warpdrive vs EspoCRM: license, self-hosting, stack, Gmail, pipelines, and workflows compared, with sources, for teams choosing an open-source CRM.",
);

export const KRAYIN_PAGE = comparisonPage(
  "krayin",
  "Krayin CRM",
  "Warpdrive vs Krayin CRM: two MIT-licensed CRMs compared on stack, self-hosting, email, pipelines, and automation, with sources.",
);

export const FRAPPE_CRM_PAGE = comparisonPage(
  "frappe-crm",
  "Frappe CRM",
  "Warpdrive vs Frappe CRM: license, self-hosting, hosted plans, stack, email, and pipelines compared, with sources, for teams choosing an open-source CRM.",
);

export const ATOMIC_CRM_PAGE = comparisonPage(
  "atomic-crm",
  "Atomic CRM",
  "Warpdrive vs Atomic CRM: two MIT-licensed TypeScript CRMs compared on deployment, email, pipelines, and stack, with sources.",
);

export const SUITECRM_PAGE = comparisonPage(
  "suitecrm",
  "SuiteCRM",
  "Warpdrive vs SuiteCRM: license, self-hosting, hosted plans, stack, email, and workflows compared, with sources, for teams choosing an open-source CRM.",
);

export const MIGRATION_PAGE: SitePage = {
  path: "/migrate-from-pipedrive",
  title: "Migrate from Pipedrive to Warpdrive",
  description:
    "Move organizations, people, leads, deals, activities, and notes from Pipedrive CSV exports into Warpdrive, with owners, links, and deal history kept.",
  updated: "2026-11-02",
};

export const SITE_PAGES: readonly SitePage[] = [
  HOME_PAGE,
  PIPEDRIVE_PAGE,
  TWENTY_PAGE,
  ESPOCRM_PAGE,
  KRAYIN_PAGE,
  FRAPPE_CRM_PAGE,
  ATOMIC_CRM_PAGE,
  SUITECRM_PAGE,
  MIGRATION_PAGE,
];
