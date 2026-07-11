export const VISIBILITY_LEVELS = ["owner", "group", "all"] as const;
export type VisibilityLevel = (typeof VISIBILITY_LEVELS)[number];
