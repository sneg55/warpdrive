"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { SETTINGS_STRINGS } from "@/constants/settingsStrings";
import type { Goal } from "@/db/schema/goals";
import { deleteGoalAction } from "@/features/goals/actions";
import { goalLabel } from "@/features/goals/goalLabel";
import { readCsrfToken } from "@/utils/csrfCookie";

const S = SETTINGS_STRINGS;

interface Props {
  goals: Goal[];
  assigneeNames: Record<string, string>;
  onChanged: () => void;
  onEdit: (goal: Goal) => void;
}

export function GoalsTable({ goals, assigneeNames, onChanged, onEdit }: Props): React.ReactElement {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function confirmDelete(): void {
    const id = pendingDelete;
    if (id === null) return;
    setPendingDelete(null);
    setError(null);
    startTransition(async () => {
      // A dead session or a stale CSRF token fails here. Refreshing without saying so leaves
      // the row on screen with no explanation, which reads as the button being broken.
      const r = await deleteGoalAction(id, readCsrfToken());
      if (!r.ok) {
        setError(S.goalSaveFailed);
        return;
      }
      onChanged();
    });
  }

  if (goals.length === 0) {
    return <p className="text-sm text-muted-foreground">{S.goalsEmpty}</p>;
  }

  return (
    <>
      {error !== null && (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">{S.goalSubject}</th>
            <th className="px-3 py-2">{S.goalAssignee}</th>
            <th className="px-3 py-2">{S.goalTarget}</th>
            <th className="px-3 py-2">{S.goalStartsOn}</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {goals.map((g) => (
            <tr key={g.id} className="border-t">
              <td className="px-3 py-2">{goalLabel(g)}</td>
              <td className="px-3 py-2">
                {g.assigneeId === null
                  ? "Whole company"
                  : (assigneeNames[g.assigneeId] ?? g.assigneeKind)}
              </td>
              <td className="px-3 py-2 tabular-nums">{g.target}</td>
              <td className="px-3 py-2 tabular-nums">{g.startsOn}</td>
              <td className="px-3 py-2 text-right">
                <span className="inline-flex gap-1">
                  <Button variant="ghost" onClick={() => onEdit(g)}>
                    {S.goalEdit}
                  </Button>
                  <Button variant="ghost" onClick={() => setPendingDelete(g.id)}>
                    {S.goalDelete}
                  </Button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={S.goalDelete}
        description={S.goalDeleteConfirm}
        confirmLabel={S.goalDelete}
        destructive
        onConfirm={confirmDelete}
      />
    </>
  );
}
