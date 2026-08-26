import { BellRing, Check, Mail, Phone, Timer, Users, Utensils } from "lucide-react";
import type React from "react";

// Shared activity type-icon map (Pipedrive shows a type glyph on every activity
// row/card). Single source of truth consumed by the Activities list, the deal
// history card and the composer type rail. Unknown keys fall back to a dot.

const ICON_CLASS = "h-4 w-4 shrink-0";

const ICONS: Record<string, React.ReactNode> = {
  call: <Phone aria-hidden="true" className={ICON_CLASS} />,
  meeting: <Users aria-hidden="true" className={ICON_CLASS} />,
  email: <Mail aria-hidden="true" className={ICON_CLASS} />,
  deadline: <Timer aria-hidden="true" className={ICON_CLASS} />,
  lunch: <Utensils aria-hidden="true" className={ICON_CLASS} />,
  task: <Check aria-hidden="true" className={ICON_CLASS} />,
  // WD's "ping" activity type is a nudge, so a bell with a ping wave.
  ping: <BellRing aria-hidden="true" className={ICON_CLASS} />,
};

// The glyph keys the picker offers when adding a custom activity type (single source of truth).
export const ACTIVITY_TYPE_ICON_KEYS = Object.keys(ICONS);

export function ActivityTypeIcon({ typeKey }: { typeKey: string }): React.ReactNode {
  return (
    ICONS[typeKey] ?? (
      <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-muted-foreground" />
    )
  );
}
