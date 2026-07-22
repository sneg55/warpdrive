// Section titles for the person/org detail sidebars (CO-2). The section header menu aria-labels
// (Edit X section / X options / Customize fields) are reused from dealSidebarStrings via
// SectionHeaderMenu, so only the contact-specific section titles live here.
export const CONTACT_SIDEBAR_STRINGS = {
  sections: {
    contact: "Contact",
    summary: "Summary",
    details: "Details",
    relatedOrgs: "Related organizations",
    stats: "Stats",
    overview: "Overview",
    people: "People",
    deals: "Deals",
  },
} as const;
