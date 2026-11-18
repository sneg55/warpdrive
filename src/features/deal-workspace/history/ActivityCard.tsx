"use client";
import Link from "next/link";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { completeActivityAction, deleteActivityAction } from "@/features/activities/actions";
import type { CalendarActivity } from "@/features/activities/calendar";
import { followUpLinksOf, useFollowUpAfterDone } from "@/features/activities/followUpAfterDone";
import { ActivityTypeIcon } from "@/features/activities/typeIcons";
import { useInvalidateActivityLists } from "@/features/activities/useInvalidateActivityLists";
import { linkifyHtml } from "@/features/collaboration/linkify";
import { formatUserName } from "@/features/identity/formatUserName";
import { useInterfacePrefs } from "@/features/identity/InterfacePrefsProvider";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { useDealActionError } from "../DealActionErrorProvider";
import { ActivityCardMenu } from "./ActivityCardMenu";

type EntityKey = { entityType: "deal" | "person" | "organization"; entityId: string };

function formatDate(at: Date): string {
  return at.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(at: Date): string {
  return at.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ActivityCard({
  activity,
  at,
  onChanged,
  onEdit,
}: {
  activity: CalendarActivity;
  at: Date;
  onChanged?: () => void;
  onEdit?: () => void;
}): React.ReactNode {
  const [done, setDone] = useState(activity.done);
  const [busy, setBusy] = useState(false);
  const utils = trpc.useUtils();
  const invalidateActivityLists = useInvalidateActivityLists();
  const reportError = useDealActionError();
  const { emailLinksNewTab } = useInterfacePrefs();
  const promptAfterDone = useFollowUpAfterDone();

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
    setDone(next);
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
      await invalidateActivityLists();
      onChanged?.();
      if (next) promptAfterDone(followUpLinksOf(activity), onChanged);
    } else {
      setDone(!next);
      for (const key of entityKeys) void utils.activities.listForEntity.invalidate(key);
      reportError(res.error.id);
    }
    setBusy(false);
  }, [
    busy,
    done,
    activity,
    entityKeys,
    utils,
    invalidateActivityLists,
    onChanged,
    reportError,
    promptAfterDone,
  ]);

  const remove = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const res = await deleteActivityAction({ id: activity.id }, readCsrfToken());
    if (res.ok) {
      for (const key of entityKeys) {
        utils.activities.listForEntity.setData(key, (old) =>
          old === undefined ? old : old.filter((a) => a.id !== activity.id),
        );
      }
      await invalidateActivityLists();
      onChanged?.();
    } else {
      reportError(res.error.id);
    }
    setBusy(false);
  }, [busy, activity.id, entityKeys, utils, invalidateActivityLists, onChanged, reportError]);

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
        <ActivityCardMenu
          done={done}
          busy={busy}
          onEdit={onEdit}
          onToggle={() => void toggle()}
          onDelete={() => void remove()}
        />
      </div>
      {activity.note != null && activity.note !== "" && (
        <div
          data-testid="activity-note"
          className="border-t bg-warning/10 px-3 py-2 text-pretty text-xs text-foreground/80 [&_a]:text-link [&_a]:underline [&_p]:m-0"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized server-side before storage
          dangerouslySetInnerHTML={{
            __html: linkifyHtml(activity.note, { emailNewTab: emailLinksNewTab }),
          }}
        />
      )}
    </div>
  );
}
