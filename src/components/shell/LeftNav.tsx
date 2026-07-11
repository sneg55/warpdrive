"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type React from "react";
import { useEffect, useState } from "react";
import { STRINGS } from "@/constants/strings";
import { cn } from "@/lib/utils";
import {
  ActivitiesIcon,
  ContactsIcon,
  DashboardIcon,
  InboxIcon,
  LeadsIcon,
  PipelineIcon,
  SettingsIcon,
} from "./NavIcons";

const ITEMS = [
  { href: "/pipeline", label: STRINGS.nav.pipeline, section: "/pipeline", Icon: PipelineIcon },
  { href: "/leads", label: STRINGS.nav.leads, section: "/leads", Icon: LeadsIcon },
  {
    href: "/contacts/people",
    label: STRINGS.nav.contacts,
    section: "/contacts",
    Icon: ContactsIcon,
  },
  {
    href: "/activities",
    label: STRINGS.nav.activities,
    section: "/activities",
    Icon: ActivitiesIcon,
  },
  { href: "/inbox", label: STRINGS.nav.inbox, section: "/inbox", Icon: InboxIcon },
  { href: "/dashboard", label: STRINGS.nav.dashboard, section: "/dashboard", Icon: DashboardIcon },
  {
    // The /settings index redirects by role (admins -> company settings, everyone else ->
    // personal preferences), so a non-admin never lands on an admin-only page.
    href: "/settings",
    label: STRINGS.nav.settings,
    section: "/settings",
    Icon: SettingsIcon,
  },
] as const;

// Preference key for the collapsed/expanded rail. Read after mount (not during SSR) so the
// server and first client render agree on the collapsed default and no hydration mismatch occurs.
const NAV_PREF_KEY = "wd.nav.expanded";
// Below this viewport width the rail auto-collapses unless the user has explicitly chosen a state.
// The nav is open by default on normal/large screens; small screens get the compact icon rail.
const EXPAND_AT_MIN_WIDTH = 1024;

// Storage access is wrapped so a blocked/absent localStorage (private mode, odd test envs) never
// throws; the preference simply does not persist in that case. Returns the explicit user choice
// ("1"/"0") or null when the user has not toggled the rail (so we follow the responsive default).
function readPref(): boolean | null {
  try {
    const v = globalThis.localStorage.getItem(NAV_PREF_KEY);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}
function writePref(expanded: boolean): void {
  try {
    globalThis.localStorage.setItem(NAV_PREF_KEY, expanded ? "1" : "0");
  } catch {
    // ignore: preference is best-effort
  }
}

export function LeftNav(): React.ReactNode {
  const pathname = usePathname();
  // SSR/first paint: collapsed, so the server and initial client markup agree (no hydration
  // mismatch). The effect below immediately applies the real state on the client.
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // An explicit user choice always wins and stays fixed regardless of viewport.
    const pref = readPref();
    if (pref !== null) {
      // localStorage and matchMedia are client-only; reading either during render would break
      // hydration. Runs once on mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe mount read
      setExpanded(pref);
      return;
    }
    // No stored choice: open by default, but follow the viewport (collapse when small), and keep
    // following on resize until the user makes an explicit choice.
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setExpanded(true);
      return;
    }
    const mq = window.matchMedia(`(min-width: ${EXPAND_AT_MIN_WIDTH}px)`);
    const apply = (): void => {
      if (readPref() === null) setExpanded(mq.matches);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  function toggle(): void {
    setExpanded((prev) => {
      const next = !prev;
      writePref(next);
      return next;
    });
  }

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "flex shrink-0 flex-col gap-1 bg-slate-900 py-3 text-slate-300 transition-[width]",
        expanded ? "w-56 items-stretch px-3" : "w-16 items-center",
      )}
    >
      {ITEMS.map((item) => {
        const active = pathname === item.section || pathname.startsWith(`${item.section}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            title={expanded ? undefined : item.label}
            className={cn(
              "flex items-center rounded-lg transition-colors",
              expanded ? "h-10 gap-3 px-3" : "h-10 w-10 justify-center",
              active
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-white",
            )}
          >
            <item.Icon />
            <span className={cn("text-sm font-medium", expanded ? "" : "sr-only")}>
              {item.label}
            </span>
          </Link>
        );
      })}

      {/* Collapse/expand toggle sits at the bottom of the rail. */}
      <button
        type="button"
        onClick={toggle}
        aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
        aria-expanded={expanded}
        className={cn(
          "mt-auto flex items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white",
          expanded ? "h-10 gap-3 px-3" : "h-10 w-10 justify-center",
        )}
      >
        <Chevron expanded={expanded} />
        {expanded && <span className="text-sm font-medium">Collapse</span>}
      </button>
    </nav>
  );
}

function Chevron({ expanded }: { expanded: boolean }): React.ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={expanded ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}
