import type React from "react";

// Shared activity type-icon map (Pipedrive shows a type glyph on every activity
// row/card). Single source of truth consumed by the Activities list, the deal
// history card (Unit A) and the composer type rail (Unit C). Dependency-free
// inline SVG drawn in currentColor; unknown keys fall back to a generic dot.
function Svg({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      {children}
    </svg>
  );
}

const ICONS: Record<string, React.ReactNode> = {
  call: (
    <Svg>
      <path d="M4 5c0 8 7 15 15 15l-3-4-3 1c-2-1-4-3-5-5l1-3-2-4z" />
    </Svg>
  ),
  meeting: (
    <Svg>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3 2-5 6-5s6 2 6 5" />
      <path d="M16 5a3 3 0 0 1 0 6" />
    </Svg>
  ),
  email: (
    <Svg>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </Svg>
  ),
  deadline: (
    <Svg>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l3 2M9 2h6" />
    </Svg>
  ),
  lunch: (
    <Svg>
      <path d="M6 3v7a2 2 0 0 0 4 0V3M8 3v18M17 3c-2 0-3 2-3 5s1 4 3 4v9" />
    </Svg>
  ),
  task: (
    <Svg>
      <path d="M4 12l5 5 11-11" />
    </Svg>
  ),
  // WD's "ping" activity type (a nudge/quick touch): a bell with a ping wave.
  ping: (
    <Svg>
      <path d="M9 17a3 3 0 0 0 6 0" />
      <path d="M6 15V10a6 6 0 0 1 12 0v5l1 2H5l1-2z" />
    </Svg>
  ),
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
