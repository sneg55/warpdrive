import type React from "react";

// Dependency-free line icons for the primary nav (Pipedrive-style icon+label).
// Stroke-based, 20x20, currentColor, aria-hidden so the link's accessible name
// stays its label text. Kept minimal on purpose: no icon library dependency.

type IconProps = { className?: string };

function Svg({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-[18px] w-[18px] shrink-0"}
    >
      {children}
    </svg>
  );
}

// Kanban columns for the pipeline board.
export function PipelineIcon(p: IconProps): React.ReactNode {
  return (
    <Svg className={p.className}>
      <rect x="3" y="4" width="5" height="16" rx="1" />
      <rect x="10" y="4" width="5" height="11" rx="1" />
      <rect x="17" y="4" width="4" height="7" rx="1" />
    </Svg>
  );
}

// Stacked list rows for deals.
export function DealsIcon(p: IconProps): React.ReactNode {
  return (
    <Svg className={p.className}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </Svg>
  );
}

// Funnel for the leads inbox (pre-deal opportunities).
export function LeadsIcon(p: IconProps): React.ReactNode {
  return (
    <Svg className={p.className}>
      <path d="M3 5h18l-7 8v6l-4 2v-8z" />
    </Svg>
  );
}

// People for contacts.
export function ContactsIcon(p: IconProps): React.ReactNode {
  return (
    <Svg className={p.className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M4 20c0-3 2-5 5-5s5 2 5 5" />
      <path d="M16 4a3 3 0 0 1 0 6" />
      <path d="M15 15c3 0 5 2 5 5" />
    </Svg>
  );
}

// Calendar for activities.
export function ActivitiesIcon(p: IconProps): React.ReactNode {
  return (
    <Svg className={p.className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="8" y1="3" x2="8" y2="6" />
      <line x1="16" y1="3" x2="16" y2="6" />
    </Svg>
  );
}

// Envelope for inbox.
export function InboxIcon(p: IconProps): React.ReactNode {
  return (
    <Svg className={p.className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </Svg>
  );
}

// Bar chart for dashboard.
export function DashboardIcon(p: IconProps): React.ReactNode {
  return (
    <Svg className={p.className}>
      <line x1="4" y1="20" x2="20" y2="20" />
      <rect x="6" y="12" width="3" height="6" rx="0.5" />
      <rect x="11" y="8" width="3" height="10" rx="0.5" />
      <rect x="16" y="4" width="3" height="14" rx="0.5" />
    </Svg>
  );
}

// Gear for settings.
export function SettingsIcon(p: IconProps): React.ReactNode {
  return (
    <Svg className={p.className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </Svg>
  );
}
