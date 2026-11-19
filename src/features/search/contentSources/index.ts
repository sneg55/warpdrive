import type { SearchSection } from "@/constants/search";
import { activitiesSource } from "./activities";
import { commentsSource } from "./comments";
import { activityCustomFieldsSource, customFieldsSource } from "./customFields";
import { emailsSource } from "./emails";
import { filesSource } from "./files";
import { intercomSource } from "./intercom";
import { notesSource } from "./notes";
import type { ContentSource } from "./types";

const COMMON_SOURCES: readonly ContentSource[] = [
  notesSource,
  commentsSource,
  activitiesSource,
  emailsSource,
  filesSource,
  customFieldsSource,
  activityCustomFieldsSource,
];

const SECTION_EXTRA_SOURCES: Record<SearchSection, readonly ContentSource[]> = {
  deal: [intercomSource],
  person: [],
  lead: [],
  organization: [],
};

export function contentSourcesFor(section: SearchSection): readonly ContentSource[] {
  return [...COMMON_SOURCES, ...SECTION_EXTRA_SOURCES[section]];
}
