import { ChevronDown } from "lucide-react";
import type React from "react";

export function SectionHeading({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <h2 className="mb-2 flex items-center gap-1 text-sm font-semibold text-foreground">
      {children}
      <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
    </h2>
  );
}
