import { ChevronDown } from "lucide-react";
import type React from "react";

// Section heading shared by the stacked Focus and History sections (S1+S2). Both the deal
// workspace and the contact/org detail page render Focus and History as always-visible stacked
// sections (not a mutually-exclusive toggle), so they share this heading to stay identical.
export function SectionHeading({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <h2 className="mb-2 flex items-center gap-1 text-sm font-semibold text-foreground">
      {children}
      <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
    </h2>
  );
}
