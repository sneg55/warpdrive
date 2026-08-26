// The primary nav, in display order. Shared by LeftNav (which renders it) and the number-key
// shortcuts (which index into it), so 1..N always addresses what the rail actually shows.
export const NAV_ITEMS = [
  { href: "/pipeline", key: "pipeline", section: "/pipeline" },
  { href: "/leads", key: "leads", section: "/leads" },
  { href: "/contacts/people", key: "contacts", section: "/contacts" },
  { href: "/activities", key: "activities", section: "/activities" },
  { href: "/inbox", key: "inbox", section: "/inbox" },
  { href: "/dashboard", key: "dashboard", section: "/dashboard" },
  // The /settings index redirects by role (admins -> company settings, everyone else -> personal
  // preferences), so a non-admin never lands on an admin-only page.
  { href: "/settings", key: "settings", section: "/settings" },
] as const;

export type NavKey = (typeof NAV_ITEMS)[number]["key"];
