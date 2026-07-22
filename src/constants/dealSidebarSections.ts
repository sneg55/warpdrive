import { DEAL_SIDEBAR_STRINGS } from "./dealSidebarStrings";

export const DEAL_SIDEBAR_SECTION_IDS = [
  "summary",
  "source",
  "person",
  "participants",
  "organization",
  "overview",
] as const;

export type DealSidebarSectionId = (typeof DEAL_SIDEBAR_SECTION_IDS)[number];

export const DEAL_SIDEBAR_SECTIONS = [
  { id: "summary", name: DEAL_SIDEBAR_STRINGS.sections.summary },
  { id: "source", name: DEAL_SIDEBAR_STRINGS.sections.source },
  { id: "person", name: DEAL_SIDEBAR_STRINGS.sections.person },
  { id: "participants", name: DEAL_SIDEBAR_STRINGS.sections.participants },
  { id: "organization", name: DEAL_SIDEBAR_STRINGS.sections.organization },
  { id: "overview", name: DEAL_SIDEBAR_STRINGS.sections.overview },
] as const;

export interface DealSidebarSectionPreference {
  id: DealSidebarSectionId;
  visible: boolean;
}

export const DEFAULT_DEAL_SIDEBAR_SECTIONS: DealSidebarSectionPreference[] =
  DEAL_SIDEBAR_SECTIONS.map((section) => ({ id: section.id, visible: true }));

export function sectionName(id: DealSidebarSectionId): string {
  return DEAL_SIDEBAR_SECTIONS.find((section) => section.id === id)?.name ?? id;
}

export function normalizeDealSidebarSections(
  input: readonly DealSidebarSectionPreference[] | undefined,
): DealSidebarSectionPreference[] {
  if (input === undefined) return [...DEFAULT_DEAL_SIDEBAR_SECTIONS];
  const seen = new Set<DealSidebarSectionId>();
  const normalized: DealSidebarSectionPreference[] = [];
  for (const section of input) {
    if (DEAL_SIDEBAR_SECTION_IDS.includes(section.id) && !seen.has(section.id)) {
      // Summary is non-hideable: it hosts the only "Manage sidebar sections" trigger, so hiding it
      // would leave the manager (and any other hidden section) unreachable.
      const visible = section.id === "summary" ? true : section.visible;
      normalized.push({ id: section.id, visible });
      seen.add(section.id);
    }
  }
  for (const section of DEFAULT_DEAL_SIDEBAR_SECTIONS) {
    if (!seen.has(section.id)) normalized.push(section);
  }
  return normalized;
}
