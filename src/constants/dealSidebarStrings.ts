export const DEAL_SIDEBAR_STRINGS = {
  sections: {
    summary: "Summary",
    details: "Details",
    source: "Source",
    person: "Person",
    participants: "Participants",
    organization: "Organization",
    overview: "Overview",
  },
  menu: {
    editSection: (section: string) => `Edit ${section} section`,
    sectionOptions: (section: string) => `${section} options`,
    fillGaps: "Fill the gaps",
    switchOrganization: "Switch to another organization",
    unlinkOrganization: "Unlink this organization",
    customizeFields: "Customize fields",
    customizeSummary: "Customize Summary",
    manageSections: "Manage sidebar sections",
  },
  orgDialog: {
    title: "Switch organization",
    organization: "Organization",
    save: "Save",
    cancel: "Cancel",
  },
} as const;
