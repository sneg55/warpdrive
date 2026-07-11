import type { MAIL_LABELS } from "@/constants/email";
import type { LabelColor } from "@/constants/labelColors";

export type MailLabel = (typeof MAIL_LABELS)[number];

// Each reader follow-up label maps to a color from the shared LABEL_COLOR_CLASSES palette so the
// inline list chips look the same as every other labelled surface. Kept next to the palette (not in
// the email feature) because it is pure data reused by both the chips and any future settings view.
export const MAIL_LABEL_COLOR: Record<MailLabel, LabelColor> = {
  important: "red",
  to_do: "orange",
  later: "blue",
};

// Human-facing chip text (the raw values are snake_case tokens, not display copy).
export const MAIL_LABEL_NAME: Record<MailLabel, string> = {
  important: "Important",
  to_do: "To do",
  later: "Later",
};
