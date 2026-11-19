export const SEARCH_PER_SECTION = 8;
export const SEARCH_CONTENT_MIN_RUN = 3;
export const SEARCH_SNIPPET_CHARS = 120;
export const SEARCH_SNIPPET_ELLIPSIS = "…";

export const SEARCH_MATCH_SOURCES = [
  "note",
  "comment",
  "activity",
  "email",
  "intercom",
  "file",
  "custom_field",
] as const;
export type SearchMatchSource = (typeof SEARCH_MATCH_SOURCES)[number];

export const SEARCH_SOURCE_LABELS: Record<Exclude<SearchMatchSource, "custom_field">, string> = {
  note: "Note",
  comment: "Comment",
  activity: "Activity",
  email: "Email",
  intercom: "Intercom",
  file: "File",
};

export const SEARCH_SECTIONS = ["deal", "person", "lead", "organization"] as const;
export type SearchSection = (typeof SEARCH_SECTIONS)[number];

export const INTERCOM_TITLE_PART_ID = "";

export const SEARCH_MATCH_SEPARATOR = "\u00b7";
