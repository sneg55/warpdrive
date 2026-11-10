"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type React from "react";
import { useEffect, useState } from "react";
import { Tip } from "@/components/ui/tooltip";
import { NAV_PREF_COOKIE } from "@/constants/cookies";
import { DOCS_SITE_URL } from "@/constants/docs";
import { NAV_ITEMS, type NavKey } from "@/constants/nav";
import { STRINGS } from "@/constants/strings";
import { isOverlayOpen, isTypingTarget } from "@/features/shortcuts/shortcutTarget";
import { cn } from "@/lib/utils";
import {
  ActivitiesIcon,
  ContactsIcon,
  DashboardIcon,
  DocsIcon,
  InboxIcon,
  LeadsIcon,
  PipelineIcon,
  SettingsIcon,
} from "./NavIcons";

const ICONS: Record<NavKey, typeof PipelineIcon> = {
  pipeline: PipelineIcon,
  leads: LeadsIcon,
  contacts: ContactsIcon,
  activities: ActivitiesIcon,
  inbox: InboxIcon,
  dashboard: DashboardIcon,
  settings: SettingsIcon,
};
const ITEMS = NAV_ITEMS.map((item) => ({
  ...item,
  label: STRINGS.nav[item.key],
  Icon: ICONS[item.key],
}));
const EXPAND_AT_MIN_WIDTH = 1024;
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
    // biome-ignore lint/suspicious/noDocumentCookie: ""
    document.cookie = `${NAV_PREF_COOKIE}=${expanded ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    return;
  }
}
interface LeftNavProps {
  initialExpanded?: boolean;
  inboxBadge?: React.ReactNode;
}
export function LeftNav({
  initialExpanded = false,
  inboxBadge,
}: LeftNavProps = {}): React.ReactNode {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(initialExpanded);

  useEffect(() => {
    const pref = readPref();
    if (pref !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpanded(pref);
      return;
    }
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "[" && e.key !== "]") return;
      if (isTypingTarget(e.target) || isOverlayOpen(document)) return;
      e.preventDefault();
      const next = e.key === "[";
      writePref(next);
      setExpanded(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
            <span className="relative">
              <item.Icon />
              {item.key === "inbox" ? inboxBadge : null}
            </span>
            <span className={cn("text-sm font-medium", expanded ? "" : "sr-only")}>
              {item.label}
            </span>
          </Link>
        );
        return expanded ? (
          el
        ) : (
          <Tip key={item.href} label={item.label}>
            {el}
          </Tip>
        );
      })}

      <DocsLink expanded={expanded} />

      <button
        type="button"
        onClick={toggle}
        aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
        aria-expanded={expanded}
        className={cn(
          "flex items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white",
          expanded ? "h-10 gap-3 px-3" : "h-10 w-10 justify-center",
        )}
      >
        <Chevron expanded={expanded} />
        {expanded && <span className="text-sm font-medium">Collapse</span>}
      </button>
    </nav>
  );
}

function DocsLink({ expanded }: { expanded: boolean }): React.ReactNode {
  const label = STRINGS.nav.docs;
  const el = (
    <a
      href={DOCS_SITE_URL}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={expanded ? undefined : label}
      className={cn(
        "mt-auto flex items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white",
        expanded ? "h-10 gap-3 px-3" : "h-10 w-10 justify-center",
      )}
    >
      <DocsIcon />
      <span className={cn("text-sm font-medium", expanded ? "" : "sr-only")}>{label}</span>
    </a>
  );
  return expanded ? el : <Tip label={label}>{el}</Tip>;
}

function Chevron({ expanded }: { expanded: boolean }): React.ReactNode {
  const Glyph = expanded ? ChevronLeft : ChevronRight;
  return <Glyph aria-hidden="true" className="h-4 w-4" />;
}
