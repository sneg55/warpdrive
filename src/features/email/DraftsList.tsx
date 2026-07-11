"use client";

import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
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
  const { data: drafts = [] } = trpc.email.drafts.list.useQuery();
  const [busyId, setBusyId] = useState<string | null>(null);
  const reportError = useActionError();

  async function remove(id: string): Promise<void> {
    setBusyId(id);
    const res = await deleteDraftAction(readCsrfToken(), { draftId: id });
    setBusyId(null);
    if (res.ok) void utils.email.drafts.list.invalidate();
    else reportError(res.error.id);
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
            disabled={busyId === d.id}
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
