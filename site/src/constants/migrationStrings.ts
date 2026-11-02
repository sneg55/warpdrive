import { DOCS_URL } from "./urls";

export const MIGRATION_STRINGS = {
  heading: "Migrate from Pipedrive to Warpdrive",
  summary:
    "Warpdrive imports Pipedrive's CSV exports directly. Export each record type from Pipedrive with its ID column, import the files in a fixed order with Pipedrive export as the source, and Warpdrive links people, organizations, leads, deals, activities, and notes back together, with owners and deal history kept.",
  steps: {
    heading: "How the migration works",
    items: [
      "Invite your team to Warpdrive first, because owners are matched to users by email, then by name.",
      "In Pipedrive, export each record type as CSV with all columns, and add the ID column in the column chooser.",
      "In Warpdrive, open Settings, then Import, upload each file, and choose Pipedrive export as the source.",
      "Check the pre-matched column mapping, then commit the import.",
      "Convert leads to deals only after every file is in.",
    ],
  },
  order: {
    heading: "Import order",
    items: ["Organizations", "People", "Leads", "Deals", "Activities", "Notes"],
  },
  kept: {
    heading: "What is kept",
    items: [
      "Owners, matched to Warpdrive users by email, then by name",
      "Links between records, by Pipedrive ID or by exact name",
      "Deal status, won and lost dates, lost reason, labels, and creation date",
      "Lead owner, labels, creation date, and archived state",
      "Activity done state and done time",
      "Pipelines and stages, created for you when the option is on",
    ],
  },
  notCarried: {
    heading: "What does not come across",
    items: [
      "Lead source and channel",
      "Products",
      "Files",
      "Email history",
      "Stage history",
      "Currencies (values import as plain numbers)",
    ],
  },
  rerun:
    "Re-running a file skips rows whose Pipedrive ID was already imported, so you can fix failed rows and run the same file again without duplicates.",
  guideLabel: "Read the full migration guide",
  guideHref: `${DOCS_URL}/guides/migrating-from-pipedrive/`,
  disclaimer: "Warpdrive is not affiliated with or endorsed by Pipedrive.",
} as const;
