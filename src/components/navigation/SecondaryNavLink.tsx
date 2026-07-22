import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type React from "react";
import { cn } from "@/lib/utils";

// Shared secondary-rail row used by Settings and Contacts. Keeping the complete row treatment in
// one component prevents icon, active-state, typography, and spacing drift between app sections.
export function SecondaryNavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}): React.ReactNode {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
        active
          ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
          : "font-normal text-foreground hover:bg-accent/60",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("h-4 w-4 shrink-0", active ? "" : "text-muted-foreground")}
      />
      {label}
    </Link>
  );
}
