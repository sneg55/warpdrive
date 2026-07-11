"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { FIELD_INPUT } from "@/constants/formStyles";
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
    <div className="max-w-xl space-y-4">
      <ul className="divide-y rounded-md border">
        {rows.map((row, i) => (
          <li key={row.id} className="flex items-center gap-3 px-3 py-2">
            {editingId === row.id ? (
              <input
                aria-label={S.lostReasonName}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className={`${FIELD_INPUT} flex-1`}
              />
            ) : (
              <span className="flex-1 text-sm">{row.name}</span>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={BTN}
                disabled={i === 0}
                onClick={() => void move(i, "up")}
              >
                {S.moveUp}
              </button>
              <button
                type="button"
                className={BTN}
                disabled={i === rows.length - 1}
                onClick={() => void move(i, "down")}
              >
                {S.moveDown}
              </button>
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

      <div className="flex items-end gap-2">
        <label className="block flex-1">
          <span className="mb-1 block text-sm font-medium">{S.lostReasonName}</span>
          <input
            aria-label={S.lostReasonName}
            required
            maxLength={200}
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            className={FIELD_INPUT}
          />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={() => void add()}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-transform hover:opacity-90 active:not-disabled:scale-[0.96] disabled:opacity-50"
        >
          {S.addLostReason}
        </button>
      </div>
    </div>
  );
}
