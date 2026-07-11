"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type React from "react";
import { STRINGS } from "@/constants/strings";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/contacts/people", label: STRINGS.nav.people, section: "/contacts/people" },
  { href: "/contacts/orgs", label: STRINGS.nav.orgs, section: "/contacts/orgs" },
  {
    href: "/contacts/timeline",
    label: STRINGS.nav.contactsTimeline,
    section: "/contacts/timeline",
  },
] as const;

// Contacts vertical sub-sidebar (IA1): People / Organizations / Timeline as a left secondary rail,
// matching Pipedrive's Contacts IA (was a horizontal tab strip). Active when the path is within the
// section (covers list and detail routes). Rendered once by the contacts layout, not per page.
export function ContactsNav(): React.ReactNode {
  const pathname = usePathname();
  return (
    <nav aria-label="Contacts sections" className="w-48 shrink-0">
      <ul className="space-y-0.5">
        {ITEMS.map((item) => {
          const active = pathname === item.section || pathname.startsWith(`${item.section}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
