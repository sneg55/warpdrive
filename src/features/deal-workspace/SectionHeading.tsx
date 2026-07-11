import type React from "react";

// Section heading shared by the stacked Focus and History sections (S1+S2). Both the deal
// workspace and the contact/org detail page render Focus and History as always-visible stacked
// sections (not a mutually-exclusive toggle), so they share this heading to stay identical.
export function SectionHeading({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <h2 className="mb-2 flex items-center gap-1 text-sm font-semibold text-foreground">
      {children}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </h2>
  );
}
