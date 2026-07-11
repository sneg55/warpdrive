import { expect, it } from "vitest";
import {
  DEFAULT_DEAL_SIDEBAR_SECTIONS,
  type DealSidebarSectionPreference,
} from "@/constants/dealSidebarSections";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { getPreferences, setSidebarSectionsPreference } from "./preferencesRepo";

const sig = () => new AbortController().signal;

function customSections(): DealSidebarSectionPreference[] {
  const org = DEFAULT_DEAL_SIDEBAR_SECTIONS.find((section) => section.id === "organization");
  expect(org).toBeDefined();
  if (org === undefined) return [...DEFAULT_DEAL_SIDEBAR_SECTIONS];
  return [
    org,
    ...DEFAULT_DEAL_SIDEBAR_SECTIONS.filter((section) => section.id !== "organization").map(
      (section) => (section.id === "details" ? { ...section, visible: false } : section),
    ),
  ];
}

it("persists deal sidebar section order and visibility per user", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db);
    const other = await seedUser(db);
    const sections = customSections();

    await setSidebarSectionsPreference(db, owner.id, sections, sig());

    const ownerPrefs = await getPreferences(db, owner.id, sig());
    expect(ownerPrefs.ui.dealSidebarSections).toEqual(sections);
    const otherPrefs = await getPreferences(db, other.id, sig());
    expect(otherPrefs.ui.dealSidebarSections).toBeUndefined();
  });
});
