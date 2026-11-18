import { BellRing, Check, Mail, Phone, Timer, Users, Utensils } from "lucide-react";
import type React from "react";

const ICON_CLASS = "h-4 w-4 shrink-0";

const ICONS: Record<string, React.ReactNode> = {
  call: <Phone aria-hidden="true" className={ICON_CLASS} />,
  meeting: <Users aria-hidden="true" className={ICON_CLASS} />,
  email: <Mail aria-hidden="true" className={ICON_CLASS} />,
  deadline: <Timer aria-hidden="true" className={ICON_CLASS} />,
  lunch: <Utensils aria-hidden="true" className={ICON_CLASS} />,
  task: <Check aria-hidden="true" className={ICON_CLASS} />,
  ping: <BellRing aria-hidden="true" className={ICON_CLASS} />,
};

export const ACTIVITY_TYPE_ICON_KEYS = Object.keys(ICONS);

export function ActivityTypeIcon({ typeKey }: { typeKey: string }): React.ReactNode {
  return (
    ICONS[typeKey] ?? (
      <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-muted-foreground" />
    )
  );
}
