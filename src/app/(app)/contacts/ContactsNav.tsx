"use client";
import { Building2, History, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import type React from "react";
import { SecondaryNavLink } from "@/components/navigation/SecondaryNavLink";
import { STRINGS } from "@/constants/strings";

const ITEMS = [
  {
    href: "/contacts/people",
    label: STRINGS.nav.people,
    section: "/contacts/people",
    icon: Users,
  },
  {
    href: "/contacts/orgs",
    label: STRINGS.nav.orgs,
    section: "/contacts/orgs",
    icon: Building2,
  },
  {
    href: "/contacts/timeline",
    label: STRINGS.nav.contactsTimeline,
    section: "/contacts/timeline",
    icon: History,
  },
] as const;

export function ContactsNav(): React.ReactNode {
  const pathname = usePathname();
  return (
    <nav aria-label="Contacts sections" className="w-56 shrink-0">
      <ul className="space-y-0.5">
        {ITEMS.map((item) => {
          const active = pathname === item.section || pathname.startsWith(`${item.section}/`);
          return (
            <li key={item.href}>
              <SecondaryNavLink
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={active}
              />
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
