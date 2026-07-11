"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";
import { cn } from "@/lib/utils";
import { SettingsHeading } from "../SettingsHeading";

const TABS = [
  { href: "/settings/company", label: STRINGS.settings.companyGeneral },
  { href: "/settings/company/activities", label: STRINGS.settings.activities },
  { href: "/settings/company/lost-reasons", label: STRINGS.settings.lostReasons },
  { href: "/settings/company/labels", label: STRINGS.settings.labels },
  { href: "/settings/company/pipelines", label: STRINGS.settings.pipelines },
] as const;

// Company settings container: title + tab strip (Currencies omitted, out of scope).
export default function CompanyLayout({ children }: { children: ReactNode }): ReactNode {
  const pathname = usePathname();
  return (
    <section>
      <SettingsHeading
        title={STRINGS.settings.companySettings}
        description={STRINGS.settings.companySettingsDescription}
      />
      <nav aria-label="Company settings" className="mb-4 flex flex-wrap gap-1 border-b">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </section>
  );
}
