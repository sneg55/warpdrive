"use client";
import { useRef, useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { readCsrfToken } from "@/utils/csrfCookie";
import { completeActivityAction } from "./actions";
import type { ActivityTableRow } from "./activityRows";
import { followUpLinksOf, useFollowUpAfterDone } from "./followUpAfterDone";

export interface ActivityRowComplete {
  isPending: (id: string) => boolean;
  complete: (id: string, currentDone: boolean) => Promise<void>;
}

export function useActivityRowComplete(
  rows: readonly ActivityTableRow[],
  refetch: () => Promise<unknown>,
): ActivityRowComplete {
  const reportError = useActionError();
  const promptAfterDone = useFollowUpAfterDone();
  const inFlight = useRef(new Set<string>());
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());

  function track(id: string, on: boolean): void {
    if (on) inFlight.current.add(id);
    else inFlight.current.delete(id);
    setPendingIds(new Set(inFlight.current));
  }

  async function complete(id: string, currentDone: boolean): Promise<void> {
    if (inFlight.current.has(id)) return;
    track(id, true);
    try {
      const r = await completeActivityAction({ id, done: !currentDone }, readCsrfToken());
      if (!r.ok) {
        reportError(r.error.id);
        return;
      }
      await refetch();
      const row = rows.find((x) => x.id === id);
      if (!currentDone && row !== undefined) promptAfterDone(followUpLinksOf(row));
    } catch {
      reportError();
    } finally {
      track(id, false);
    }
  }

  return { isPending: (id) => pendingIds.has(id), complete };
}
