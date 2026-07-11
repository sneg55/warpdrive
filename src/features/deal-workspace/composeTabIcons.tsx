import type React from "react";

// Thin line icons (understated, Pipedrive-style) for the deal compose toolbar.
// One shared frame keeps stroke weight and sizing consistent across tabs.
function Icon({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const ActivityIcon = (): React.ReactNode => (
  <Icon>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M8 2v4M16 2v4M3 10h18" />
  </Icon>
);

export const NotesIcon = (): React.ReactNode => (
  <Icon>
    <path d="M4 4h11l5 5v11H4z" />
    <path d="M15 4v5h5" />
  </Icon>
);

export const EmailIcon = (): React.ReactNode => (
  <Icon>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </Icon>
);

export const FilesIcon = (): React.ReactNode => (
  <Icon>
    <path d="M20 12l-8 8a5 5 0 01-7-7l8-8a3 3 0 014 4l-8 8a1 1 0 01-2-2l7-7" />
  </Icon>
);
