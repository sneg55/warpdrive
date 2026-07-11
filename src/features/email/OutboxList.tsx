"use client";

import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { ROW_ACTION_BUTTON } from "@/constants/formStyles";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { cancelOutboxAction } from "./folderActions";

function statusLabel(status: string, scheduledAt: string | null): string {
  if (scheduledAt !== null) return `Scheduled ${new Date(scheduledAt).toLocaleString()}`;
  if (status === "needs_review") return "Needs review";
  if (status === "sending") return "Sending";
  return "Queued to send";
}

// A pending or future-scheduled row is cancelable (unsent + unclaimed). A row a worker has
// picked up ("sending") or parked ("needs_review") is NOT: the server refuses those, so the
// button must not appear even when a future scheduledAt is set.
function isCancelable(status: string, scheduledAt: string | null): boolean {
  if (status === "sending" || status === "needs_review") return false;
  return status === "pending" || scheduledAt !== null;
}

export function OutboxList(): React.ReactNode {
  const utils = trpc.useUtils();
  const { data: items = [] } = trpc.email.folders.outbox.useQuery();
  const [busyId, setBusyId] = useState<string | null>(null);
  const reportError = useActionError();

  async function cancel(id: string): Promise<void> {
    setBusyId(id);
    const res = await cancelOutboxAction(readCsrfToken(), { attemptId: id });
    setBusyId(null);
    if (res.ok) void utils.email.folders.outbox.invalidate();
    else reportError(res.error.id);
  }

  if (items.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">Nothing queued to send.</div>;
  }
  return (
    <ul className="divide-y">
      {items.map((it) => (
        <li key={it.id} className="flex items-start justify-between gap-2 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{it.subject ?? "(no subject)"}</p>
            <p className="truncate text-xs text-muted-foreground">{it.to.join(", ")}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {statusLabel(it.status, it.scheduledAt)}
            </p>
            {it.errorId !== null && <p className="text-xs text-destructive">{it.errorId}</p>}
          </div>
          {isCancelable(it.status, it.scheduledAt) ? (
            <button
              type="button"
              disabled={busyId === it.id}
              onClick={() => void cancel(it.id)}
              className={ROW_ACTION_BUTTON}
            >
              Cancel
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
