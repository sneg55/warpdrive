"use client";

import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { ERROR_IDS } from "@/constants/errorIds";
import { ROW_ACTION_BUTTON } from "@/constants/formStyles";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import type { DraftSummary } from "./draftRepo";
import { deleteDraftAction } from "./folderActions";

export function DraftsList({
  onResume,
}: {
  onResume: (draft: DraftSummary) => void;
}): React.ReactNode {
  const utils = trpc.useUtils();
  const { data: allDrafts = [] } = trpc.email.drafts.list.useQuery();
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [deletedIds, setDeletedIds] = useState<ReadonlySet<string>>(new Set());
  const reportError = useActionError();
  const drafts = allDrafts.filter((d) => !deletedIds.has(d.id));

  function withId(set: ReadonlySet<string>, id: string, present: boolean): ReadonlySet<string> {
    const next = new Set(set);
    if (present) next.add(id);
    else next.delete(id);
    return next;
  }

  async function remove(id: string): Promise<void> {
    if (busyIds.has(id)) return;
    setBusyIds((s) => withId(s, id, true));
    try {
      const res = await deleteDraftAction(readCsrfToken(), { draftId: id });
      if (res.ok) {
        setDeletedIds((s) => withId(s, id, true));
        void utils.email.drafts.list.invalidate();
      } else reportError(res.error.id);
    } catch {
      reportError(ERROR_IDS.UI_ACTION_UNCONFIRMED);
    } finally {
      setBusyIds((s) => withId(s, id, false));
    }
  }

  if (drafts.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No saved drafts.</div>;
  }
  return (
    <ul className="divide-y">
      {drafts.map((d) => (
        <li key={d.id} className="flex items-start justify-between gap-2 p-3">
          <button type="button" onClick={() => onResume(d)} className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-medium">
              {d.subject !== null && d.subject !== "" ? d.subject : "(no subject)"}
            </p>
            <p className="truncate text-xs text-muted-foreground">{d.toEmails.join(", ")}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {new Date(d.updatedAt).toLocaleString()}
            </p>
          </button>
          <button
            type="button"
            disabled={busyIds.has(d.id)}
            onClick={() => void remove(d.id)}
            className={ROW_ACTION_BUTTON}
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}
