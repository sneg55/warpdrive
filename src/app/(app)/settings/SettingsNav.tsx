"use client";
import {
  Bell,
  Building2,
  Eye,
  type LucideIcon,
  Mail,
  MailCheck,
  Plug,
  ShieldCheck,
  Table2,
  Upload,
  User,
  Users,
  UsersRound,
} from "lucide-react";
import { usePathname } from "next/navigation";
import type React from "react";
import { SecondaryNavLink } from "@/components/navigation/SecondaryNavLink";
import { STRINGS } from "@/constants/strings";

interface NavItem {
  href: string;
  label: string;
  // Leading glyph, matching Pipedrive's settings menu (each row is icon + label).
  icon: LucideIcon;
}
interface NavSection {
  title: string;
  items: NavItem[];
}

const MY_ACCOUNT: NavSection = {
  title: STRINGS.settings.myAccount,
  items: [
    { href: "/settings/profile", label: STRINGS.settings.profile, icon: User },
    { href: "/settings/notifications", label: STRINGS.settings.notifications, icon: Bell },
    { href: "/settings/email-sync", label: STRINGS.settings.emailSync, icon: MailCheck },
    { href: "/settings/email", label: STRINGS.settings.emailTemplates, icon: Mail },
    { href: "/settings/connections", label: STRINGS.settings.connectedApps, icon: Plug },
  ],
};

// Company items are admin-only; hidden (not disabled) for non-admins.
const COMPANY: NavSection = {
  title: STRINGS.settings.companyOverview,
  items: [
    { href: "/settings/company", label: STRINGS.settings.companySettings, icon: Building2 },
    { href: "/settings/users", label: STRINGS.settings.users, icon: Users },
    { href: "/settings/teams", label: STRINGS.settings.teams, icon: UsersRound },
    {
      href: "/settings/permission-sets",
      label: STRINGS.settings.permissionSets,
      icon: ShieldCheck,
    },
    { href: "/settings/visibility-groups", label: STRINGS.settings.visibilityGroups, icon: Eye },
    { href: "/settings/fields", label: STRINGS.settings.dataFields, icon: Table2 },
  ],
};

// Grouped left secondary menu (Pipedrive settings IA): My account for everyone, Company overview
// for admins. Replaces the old flat tab bar.
export function SettingsNav({
  isAdmin,
  canImport,
}: {
  isAdmin: boolean;
  canImport: boolean;
}): React.ReactNode {
  const pathname = usePathname();
  const importItem: NavItem = {
    href: "/settings/import",
    label: STRINGS.settings.importData,
    icon: Upload,
  };
  const company: NavSection = {
    title: COMPANY.title,
    items: canImport ? [...COMPANY.items, importItem] : COMPANY.items,
  };
  const sections = isAdmin
    ? [MY_ACCOUNT, company]
    : canImport
      ? [MY_ACCOUNT, { title: COMPANY.title, items: [importItem] }]
      : [MY_ACCOUNT];

  return (
    <nav aria-label="Settings sections" className="w-56 shrink-0 space-y-4">
      {sections.map((section) => (
        <div key={section.title}>
          {/* PD section header: 13px uppercase, muted, no extra letter-spacing. */}
          <p className="mb-1 px-2 text-[13px] font-semibold uppercase text-muted-foreground">
            {section.title}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <SecondaryNavLink
                    href={item.href}
                    label={item.label}
                    icon={Icon}
                    active={active}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
