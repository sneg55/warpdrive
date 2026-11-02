export interface SitePage {
  path: string;
  title: string;
  description: string;
}

export const HOME_PAGE: SitePage = {
  path: "/",
  title: "Warpdrive, the open-source self-hosted Pipedrive alternative",
  description:
    "Warpdrive is a free, open-source, self-hosted Pipedrive alternative: pipelines, deals, contacts, and two-way Gmail on your own infrastructure.",
};

export const TWENTY_PAGE: SitePage = {
  path: "/vs/twenty",
  title: "Warpdrive vs Twenty: open-source CRM comparison",
  description:
    "Warpdrive vs Twenty: license, self-hosting, email, pipelines, and workflows compared, with sources, for teams choosing an open-source CRM.",
};

export const ESPOCRM_PAGE: SitePage = {
  path: "/vs/espocrm",
  title: "Warpdrive vs EspoCRM: open-source CRM comparison",
  description:
    "Warpdrive vs EspoCRM: license, self-hosting, stack, Gmail, pipelines, and workflows compared, with sources, for teams choosing an open-source CRM.",
};

export const MIGRATION_PAGE: SitePage = {
  path: "/migrate-from-pipedrive",
  title: "Migrate from Pipedrive to Warpdrive",
  description:
    "Move organizations, people, leads, deals, activities, and notes from Pipedrive CSV exports into Warpdrive, with owners, links, and deal history kept.",
};

export const SITE_PAGES: readonly SitePage[] = [HOME_PAGE, TWENTY_PAGE, ESPOCRM_PAGE, MIGRATION_PAGE];
