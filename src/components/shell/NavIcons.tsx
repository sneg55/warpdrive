import {
  BookOpen,
  CalendarDays,
  ChartColumn,
  Inbox,
  Kanban,
  Settings,
  Sprout,
  Users,
} from "lucide-react";
import type React from "react";

type IconProps = { className?: string };

const NAV_ICON_CLASS = "h-[18px] w-[18px] shrink-0";

export function DocsIcon({ className }: IconProps): React.ReactNode {
  return <BookOpen aria-hidden="true" className={className ?? NAV_ICON_CLASS} />;
}

export function PipelineIcon({ className }: IconProps): React.ReactNode {
  return <Kanban aria-hidden="true" className={className ?? NAV_ICON_CLASS} />;
}

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
