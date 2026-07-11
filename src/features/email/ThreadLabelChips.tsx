import type React from "react";
import { LABEL_COLOR_CLASSES } from "@/constants/labelColors";
import { MAIL_LABEL_COLOR, MAIL_LABEL_NAME, type MailLabel } from "@/constants/mailLabelColors";

const KNOWN_LABELS = new Set<string>(Object.keys(MAIL_LABEL_NAME));

// Display-only colored chips for a thread's reader labels (P5). Editing stays in the reader's
// follow-up controls; the row just surfaces the current labels. Unknown values are skipped so a
// stray label token never renders an unstyled chip. Renders nothing when there are no known labels.
export function ThreadLabelChips({ labels }: { labels: string[] }): React.ReactNode {
  const known = labels.filter((l): l is MailLabel => KNOWN_LABELS.has(l));
  if (known.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {known.map((l) => (
        <span
          key={l}
          className={`rounded border px-1.5 py-0.5 text-xs ${LABEL_COLOR_CLASSES[MAIL_LABEL_COLOR[l]]}`}
        >
          {MAIL_LABEL_NAME[l]}
        </span>
      ))}
    </span>
  );
}
