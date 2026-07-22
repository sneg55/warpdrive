"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { STRINGS } from "@/constants/strings";
import {
  archiveLostReasonAction,
  createLostReasonAction,
  renameLostReasonAction,
  reorderLostReasonsAction,
} from "@/features/settings/lostReasonActions";
import { moveInArray } from "@/features/settings/reorder";
import { useSyncedState } from "@/lib/useSyncedState";
import { readCsrfToken } from "@/utils/csrfCookie";
import { ReorderControls } from "../ReorderControls";

export interface LostReasonRow {
  id: string;
  name: string;
}

const S = STRINGS.settings;
const BTN = "text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40";

// Lost reasons tab (spec 6.3): archive is a soft-delete; historical deals keep their reason.
export function LostReasonsClient({ rows: initial }: { rows: LostReasonRow[] }): React.ReactNode {
  const router = useRouter();
  const reportError = useActionError();
  // Re-seeds from refreshed server props: add/rename/archive call router.refresh(), which re-runs
  // the server component with fresh rows. Without this the list stays frozen until a hard reload
  // (SETTINGS-08). Re-seeding during render avoids the stale-then-correct double render an effect
  // would cause; `initial` comes from a server component, so its identity only changes on refresh.
  const [rows, setRows] = useSyncedState(initial);
  const [addName, setAddName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [pending, setPending] = useState(false);

  async function add(): Promise<void> {
    const name = addName.trim();
    if (name === "") return;
    setPending(true);
    const r = await createLostReasonAction({ name }, readCsrfToken());
    setPending(false);
    if (r.ok) {
      setAddName("");
      router.refresh();
    } else reportError(r.error.id);
  }

  async function rename(id: string): Promise<void> {
    const name = editName.trim();
    if (name === "") return;
    const r = await renameLostReasonAction({ id, name }, readCsrfToken());
    if (!r.ok) {
      reportError(r.error.id);
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function archive(id: string): Promise<void> {
    const r = await archiveLostReasonAction({ id }, readCsrfToken());
    if (!r.ok) {
      reportError(r.error.id);
      return;
    }
    router.refresh();
  }

  async function move(index: number, dir: "up" | "down"): Promise<void> {
    const next = moveInArray(rows, index, dir);
    if (next[index]?.id === rows[index]?.id) return;
    setRows(next);
    const r = await reorderLostReasonsAction(
      { orderedIds: next.map((r) => r.id) },
      readCsrfToken(),
    );
    if (!r.ok) {
      reportError(r.error.id);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y overflow-hidden rounded-lg border bg-card shadow-sm">
        {rows.map((row, i) => (
          <li key={row.id} className="flex items-center gap-3 px-3 py-2">
            {editingId === row.id ? (
              <Input
                aria-label={S.lostReasonName}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-8 flex-1"
              />
            ) : (
              <span className="flex-1 text-sm">{row.name}</span>
            )}
            <div className="flex items-center gap-3">
              <ReorderControls
                canMoveUp={i > 0}
                canMoveDown={i < rows.length - 1}
                onMoveUp={() => void move(i, "up")}
                onMoveDown={() => void move(i, "down")}
              />
              {editingId === row.id ? (
                <button type="button" className={BTN} onClick={() => void rename(row.id)}>
                  {S.save}
                </button>
              ) : (
                <button
                  type="button"
                  className={BTN}
                  onClick={() => {
                    setEditingId(row.id);
                    setEditName(row.name);
                  }}
                >
                  {S.rename}
                </button>
              )}
              <button type="button" className={BTN} onClick={() => void archive(row.id)}>
                {S.archive}
              </button>
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted-foreground">{S.emptyList}</li>
        )}
      </ul>

      <div className="flex items-end gap-3 rounded-lg border bg-card p-4 shadow-sm">
        <label htmlFor="new-lost-reason" className="block flex-1">
          <span className="mb-1 block text-sm font-medium">{S.lostReasonName}</span>
          <Input
            id="new-lost-reason"
            aria-label={S.lostReasonName}
            required
            maxLength={200}
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            className="w-full"
          />
        </label>
        <Button
          type="button"
          variant="default"
          size="sm"
          className="px-3"
          disabled={pending}
          onClick={() => void add()}
        >
          {S.addLostReason}
        </Button>
      </div>
    </div>
  );
}
