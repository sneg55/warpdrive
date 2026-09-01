export const PROSPECT_SELECTION_MAX = 100;
export const PROSPECT_REVEAL_CHUNK = 5;
export const PROSPECT_SEARCH_PER_PAGE = 25;
export const PROSPECT_SEARCH_MAX_PAGE = 100;
export const PROSPECT_SEARCH_MAX_TITLES = 10;
export const PROSPECT_RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;

export const PROSPECT_SENIORITIES = [
  "owner",
  "founder",
  "c_suite",
  "partner",
  "vp",
  "head",
  "director",
  "manager",
  "senior",
  "entry",
  "intern",
] as const;

export type ProspectSeniority = (typeof PROSPECT_SENIORITIES)[number];
