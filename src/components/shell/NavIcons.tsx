import {
  CalendarDays,
  ChartColumn,
  Inbox,
  Kanban,
  List,
  Settings,
  Sprout,
  Users,
} from "lucide-react";
import type React from "react";

// Named wrappers over lucide so the nav's glyph vocabulary lives in one place.
// aria-hidden keeps each link's accessible name its label text.

type IconProps = { className?: string };

const NAV_ICON_CLASS = "h-[18px] w-[18px] shrink-0";

export function PipelineIcon({ className }: IconProps): React.ReactNode {
  return <Kanban aria-hidden="true" className={className ?? NAV_ICON_CLASS} />;
}

export function DealsIcon({ className }: IconProps): React.ReactNode {
  return <List aria-hidden="true" className={className ?? NAV_ICON_CLASS} />;
}

// Sprout, not a funnel: the board's Filter control is lucide's funnel, and two
// identical glyphs in one viewport would read as the same thing.
export function LeadsIcon({ className }: IconProps): React.ReactNode {
  return <Sprout aria-hidden="true" className={className ?? NAV_ICON_CLASS} />;
}

export function ContactsIcon({ className }: IconProps): React.ReactNode {
  return <Users aria-hidden="true" className={className ?? NAV_ICON_CLASS} />;
}

export function ActivitiesIcon({ className }: IconProps): React.ReactNode {
  return <CalendarDays aria-hidden="true" className={className ?? NAV_ICON_CLASS} />;
}

export function InboxIcon({ className }: IconProps): React.ReactNode {
  return <Inbox aria-hidden="true" className={className ?? NAV_ICON_CLASS} />;
}

export function DashboardIcon({ className }: IconProps): React.ReactNode {
  return <ChartColumn aria-hidden="true" className={className ?? NAV_ICON_CLASS} />;
}

export function SettingsIcon({ className }: IconProps): React.ReactNode {
  return <Settings aria-hidden="true" className={className ?? NAV_ICON_CLASS} />;
}
