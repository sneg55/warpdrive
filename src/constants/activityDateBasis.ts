export const ACTIVITY_DATE_BASES = ["due", "done"] as const;
export type ActivityDateBasis = (typeof ACTIVITY_DATE_BASES)[number];
export const DEFAULT_ACTIVITY_DATE_BASIS: ActivityDateBasis = "due";
