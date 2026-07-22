"use client";
import Link from "next/link";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { completeActivityAction } from "@/features/activities/actions";
import type { CalendarActivity } from "@/features/activities/calendar";
import { ActivityTypeIcon } from "@/features/activities/typeIcons";
import { formatUserName } from "@/features/identity/formatUserName";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { useDealActionError } from "../DealActionErrorProvider";

type EntityKey = { entityType: "deal" | "person" | "organization"; entityId: string };

function formatDate(at: Date): string {
  return at.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Completion stamp includes the time of day (Pipedrive shows "Done <date> <time>"): the user
// wants to see WHEN an activity was actually completed, not just the day.
function formatDateTime(at: Date): string {
  return at.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Enriched activity card (Pipedrive parity): interactive mark-as-done checkbox,
// a footer with due date / created-by / linked person + org, and a "More actions"
// overflow. Mark-done is a two-way toggle: the checkbox (and the menu item) let
// the user complete an open activity or reopen a completed one.
export function ActivityCard({
  activity,
  at,
  onChanged,
  onEdit,
}: {
  activity: CalendarActivity;
  at: Date;
  onChanged?: () => void;
  // Opens this activity in the inline composer for editing (deal workspace). The subject line and
  // the "Edit" menu item both call it; omitted where editing is not offered.
  onEdit?: () => void;
}): React.ReactNode {
  const [done, setDone] = useState(activity.done);
  const [busy, setBusy] = useState(false);
  const utils = trpc.useUtils();
  const reportError = useDealActionError();

  // Every listForEntity timeline this activity appears in (deal / person / org pages). Flipping
  // its done in each cache moves it between Focus and History instantly, before the server replies.
  const entityKeys = useMemo<EntityKey[]>(() => {
    const keys: EntityKey[] = [];
    if (activity.dealId !== null) keys.push({ entityType: "deal", entityId: activity.dealId });
    if (activity.personId !== null)
      keys.push({ entityType: "person", entityId: activity.personId });
    if (activity.orgId !== null) {
      keys.push({ entityType: "organization", entityId: activity.orgId });
    }
    return keys;
  }, [activity.dealId, activity.personId, activity.orgId]);

  const toggle = useCallback(async () => {
    if (busy) return;
    const next = !done;
    setBusy(true);
    setDone(next); // optimistic (checkbox + the lead fallback where no listForEntity cache matches)
    // Optimistic move: reflect the new done (and completion time) in every timeline cache so the
    // card leaves Focus / enters History immediately.
    const doneAt = next ? new Date() : null;
    for (const key of entityKeys) {
      utils.activities.listForEntity.setData(key, (old) =>
        old === undefined
          ? old
          : old.map((a) => (a.id === activity.id ? { ...a, done: next, doneAt } : a)),
      );
    }
    const res = await completeActivityAction({ id: activity.id, done: next }, readCsrfToken());
    if (res.ok) {
      onChanged?.(); // reconcile with server truth (real doneAt, ordering)
    } else {
      // Roll the optimistic move back by refetching, and explain the failure instead of a silent
      // revert (matches the deal sidebar's action-error handling).
      setDone(!next);
      for (const key of entityKeys) void utils.activities.listForEntity.invalidate(key);
      reportError(res.error.id);
    }
    setBusy(false);
  }, [busy, done, activity.id, entityKeys, utils, onChanged, reportError]);

  return (
    <div className="overflow-hidden rounded-md border bg-card transition-colors hover:border-ring/40">
      <div className="flex items-start gap-2.5 px-3 py-2">
        <Checkbox
          checked={done}
          onCheckedChange={() => void toggle()}
          disabled={busy}
          label={done ? "Reopen activity" : "Mark as done"}
          className="mt-0.5 rounded-full data-[state=checked]:border-success data-[state=checked]:bg-success data-[state=checked]:text-success-foreground"
        />
        <div className="min-w-0 flex-1">
          {/* Subject is a button so clicking it opens the inline edit composer (deal workspace);
              keyboard-accessible, and avoids nesting the card's links inside a clickable region. */}
          <button
            type="button"
            onClick={() => onEdit?.()}
            disabled={onEdit === undefined}
            className="flex w-full items-center gap-1.5 text-pretty text-left text-sm font-medium text-foreground enabled:hover:text-primary disabled:cursor-default"
          >
            <ActivityTypeIcon typeKey={activity.typeKey} />
            <span className="min-w-0 truncate">{activity.subject}</span>
          </button>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {activity.overdue ? (
              <span className="font-semibold uppercase text-destructive">Overdue</span>
            ) : null}
            <span
              data-testid="activity-date"
              className={activity.overdue ? "text-destructive" : ""}
            >
              {formatDate(at)}
            </span>
            {activity.durationMinutes !== null ? (
              <span>· {activity.durationMinutes} min</span>
            ) : null}
            {activity.ownerName != null ? (
              <span>· {formatUserName(activity.ownerName)}</span>
            ) : null}
            {activity.personId !== null ? (
              <Link
                href={`/contacts/people/${activity.personId}`}
                className="text-primary hover:underline"
                aria-label="Linked person"
              >
                · {activity.personName ?? "Person"}
              </Link>
            ) : null}
            {activity.orgId !== null ? (
              <Link
                href={`/contacts/orgs/${activity.orgId}`}
                className="text-primary hover:underline"
                aria-label="Linked organization"
              >
                · {activity.orgName ?? "Organization"}
              </Link>
            ) : null}
          </p>
          {done && activity.doneAt != null ? (
            <p data-testid="activity-completed" className="mt-0.5 text-xs text-success">
              Completed {formatDateTime(activity.doneAt)}
            </p>
          ) : null}
          {activity.videoCallUrl != null && activity.videoCallUrl !== "" ? (
            <a
              href={activity.videoCallUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Join video call
            </a>
          ) : null}
          {activity.location != null && activity.location !== "" && (
            <div className="text-xs text-muted-foreground">{activity.location}</div>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="More actions"
            // Pseudo-element extends the 24px control to a ~40px hit target without changing layout.
            className="relative rounded p-1 text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:bg-accent hover:text-foreground"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" aria-label="More actions" className="min-w-40">
            {onEdit !== undefined && (
              <DropdownMenuItem onSelect={() => onEdit()}>Edit</DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => void toggle()}>
              {done ? "Reopen" : "Mark as done"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {activity.note != null && activity.note !== "" && (
        <div
          data-testid="activity-note"
          className="border-t bg-warning/10 px-3 py-2 text-pretty text-xs text-foreground/80 [&_p]:m-0"
          // Note HTML is sanitized on write (createActivity -> sanitizeAuthorHtml); safe to render.
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized server-side before storage
          dangerouslySetInnerHTML={{ __html: activity.note }}
        />
      )}
    </div>
  );
}
