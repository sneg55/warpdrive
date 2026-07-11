export const MENTION_SOURCES = ["note", "comment"] as const;
export type MentionSource = (typeof MENTION_SOURCES)[number];
