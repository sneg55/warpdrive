"use client";
import { useEffect, useState } from "react";
import {
  MILLISECONDS_PER_DAY,
  MILLISECONDS_PER_HOUR,
  TEAM_MAILBOX_CLOCK_REFRESH_MS,
} from "@/constants/teamMailbox";
import type { TeamReplyStatus } from "./replyStatus";

export function TeamReplyChip({
  status,
  now,
}: {
  status?: TeamReplyStatus | null;
  now?: number;
}): React.ReactNode {
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    if (status?.kind !== "unanswered") return;
    const timer = setInterval(() => setClock(Date.now()), TEAM_MAILBOX_CLOCK_REFRESH_MS);
    return () => clearInterval(timer);
  }, [status?.kind]);
  if (status == null) return null;
  const base = "shrink-0 rounded px-1.5 py-0.5 text-xs";
  if (status.kind === "replied")
    return (
      <span className={`${base} bg-muted text-muted-foreground`}>
        Replied{status.byName === null ? "" : ` · ${status.byName}`}
      </span>
    );
  const wait = Math.max(0, (now ?? clock) - new Date(status.waitingSince).getTime());
  const label =
    wait < MILLISECONDS_PER_DAY
      ? `${Math.floor(wait / MILLISECONDS_PER_HOUR)}h`
      : `${Math.floor(wait / MILLISECONDS_PER_DAY)}d`;
  const color =
    wait >= status.overdueAfterHours * MILLISECONDS_PER_HOUR
      ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
  return <span className={`${base} ${color}`}>Unanswered {label}</span>;
}
