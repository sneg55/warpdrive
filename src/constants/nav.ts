export const NAV_ITEMS = [
  { href: "/pipeline", key: "pipeline", section: "/pipeline" },
  { href: "/leads", key: "leads", section: "/leads" },
  { href: "/contacts/people", key: "contacts", section: "/contacts" },
  { href: "/activities", key: "activities", section: "/activities" },
  { href: "/inbox", key: "inbox", section: "/inbox" },
  { href: "/dashboard", key: "dashboard", section: "/dashboard" },
  { href: "/settings", key: "settings", section: "/settings" },
] as const;

export type NavKey = (typeof NAV_ITEMS)[number]["key"];
