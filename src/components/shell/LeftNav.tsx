"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type React from "react";
import { useEffect, useState } from "react";
import { Tip } from "@/components/ui/tooltip";
import { NAV_PREF_COOKIE } from "@/constants/cookies";
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

// The collapsed/expanded rail preference lives in a COOKIE, not localStorage, so the server layout
// can read it (NAV_PREF_COOKIE, from the shared non-client constants module) and render the correct
// width at first paint. localStorage is invisible to the server, which forced the old "render
// collapsed, correct on mount" jump that animated the rail open on every reload.
// Below this viewport width the rail auto-collapses unless the user has explicitly chosen a state.
// The nav is open by default on normal/large screens; small screens get the compact icon rail.
const EXPAND_AT_MIN_WIDTH = 1024;

// Cookie access is wrapped so an odd/absent environment never throws; the preference just does not
// persist. Returns the explicit user choice ("1"/"0") or null when the user has not toggled the rail
// (so we follow the responsive default). Client-only: called from the mount effect, never in render.
function readPref(): boolean | null {
  try {
    for (const part of document.cookie.split(";")) {
      const [key, value] = part.trim().split("=");
      if (key === NAV_PREF_COOKIE) return value === "1" ? true : value === "0" ? false : null;
    }
    return null;
  } catch {
    return null;
  }
}
function writePref(expanded: boolean): void {
  try {
    // path=/ so the server reads it on the next navigation; a year's max-age so it survives; lax is
    // fine for a non-sensitive UI preference.
    document.cookie = `${NAV_PREF_COOKIE}=${expanded ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // ignore: preference is best-effort
  }
}

interface LeftNavProps {
  // The persisted rail state, read from the cookie by the server layout so the first paint already
  // has the right width. Absent (undefined) collapses by default, matching a first-ever visit.
  initialExpanded?: boolean;
}

export function LeftNav({ initialExpanded = false }: LeftNavProps = {}): React.ReactNode {
  const pathname = usePathname();
  // First paint uses the server-provided persisted state (from the cookie) so there is no post-mount
  // width jump to animate. The effect below still reconciles the explicit choice + responsive default.
  const [expanded, setExpanded] = useState(initialExpanded);

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
        const el = (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            aria-label={expanded ? undefined : item.label}
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
        // Collapsed rail is icon-only, so surface the label as a hover tooltip; expanded shows it inline.
        return expanded ? (
          el
        ) : (
          <Tip key={item.href} label={item.label}>
            {el}
          </Tip>
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
