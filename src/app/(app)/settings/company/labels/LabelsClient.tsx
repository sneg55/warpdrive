"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ERROR_IDS } from "@/constants/errorIds";
import {
  LABEL_COLORS,
  LABEL_TARGETS,
  type LabelColor,
  type LabelTarget,
} from "@/constants/labelColors";
import { STRINGS } from "@/constants/strings";
import {
  createLabelAction,
  deleteLabelAction,
  renameLabelAction,
  reorderLabelsAction,
  setLabelColorAction,
} from "@/features/labels/actions";
import { moveInArray } from "@/features/settings/reorder";
import { useSyncedState } from "@/lib/useSyncedState";
import { readCsrfToken } from "@/utils/csrfCookie";
import { LabelColorSelect } from "./LabelColorSelect";
import { LabelRow, type LabelRowData } from "./LabelRow";

interface Row extends LabelRowData {
  target: LabelTarget;
}

const S = STRINGS.settings;
const TARGET_LABEL: Record<LabelTarget, string> = {
  deal: S.targetDeal,
  person: S.targetPerson,
  organization: S.targetOrganization,
  lead: S.targetLead,
};

// Labels tab (spec 6.4): grouped by target, enum-constrained color picker, guarded delete.
export function LabelsClient({ rows: initial }: { rows: Row[] }): React.ReactNode {
  const router = useRouter();
  // Re-seeds from refreshed server props, so a failed reorder's optimistic order cannot stick
  // until a hard reload (SETTINGS-08 sibling).
  const [rows, setRows] = useSyncedState(initial);
  const reportError = useActionError();
  const [addName, setAddName] = useState<Record<string, string>>({});
  const [addColor, setAddColor] = useState<Record<string, LabelColor>>({});
  const [error, setError] = useState<string | null>(null);
  const csrf = (): string | null => readCsrfToken();

  async function add(target: LabelTarget): Promise<void> {
    const name = (addName[target] ?? "").trim();
    if (name === "") return;
    const color = addColor[target] ?? LABEL_COLORS[0];
    const r = await createLabelAction({ target, name, color }, csrf());
    if (r.ok) {
      setAddName((s) => ({ ...s, [target]: "" }));
      router.refresh();
    }
  }

  async function del(id: string): Promise<void> {
    setError(null);
    const r = await deleteLabelAction({ id }, csrf());
    if (r.ok) router.refresh();
    else if (r.error.id === ERROR_IDS.LABEL_IN_USE) setError(S.deleteLabelBlocked);
  }

  async function move(target: LabelTarget, groupIds: string[], index: number, dir: "up" | "down") {
    const next = moveInArray(groupIds, index, dir);
    if (next[index] === groupIds[index]) return;
    // Optimistically reflect the new within-group order in the flat list.
    const others = rows.filter((r) => r.target !== target);
    const byId = new Map(rows.map((r) => [r.id, r] as const));
    const reordered = next.map((id) => byId.get(id)).filter((r): r is Row => r !== undefined);
    setRows([...others, ...reordered]);
    const r = await reorderLabelsAction({ orderedIds: next }, csrf());
    if (!r.ok) reportError(r.error.id);
    // Refresh either way: on success it confirms the new order, on failure it re-fetches server
    // truth and the re-seed effect above reverts the optimistic order the write did not land.
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error !== null && <p className="text-sm text-red-600">{error}</p>}
      {LABEL_TARGETS.map((target) => {
        const group = rows.filter((r) => r.target === target);
        const groupIds = group.map((r) => r.id);
        return (
          <section key={target} className="space-y-2">
            <h2 className="text-sm font-semibold">{TARGET_LABEL[target]}</h2>
            <ul className="divide-y overflow-hidden rounded-lg border bg-card shadow-sm">
              {group.map((row, i) => (
                <LabelRow
                  key={row.id}
                  row={row}
                  isFirst={i === 0}
                  isLast={i === group.length - 1}
                  onMove={(dir) => void move(target, groupIds, i, dir)}
                  onRename={(name) => {
                    void renameLabelAction({ id: row.id, name }, csrf()).then(() =>
                      router.refresh(),
                    );
                  }}
                  onColor={(color) => {
                    void setLabelColorAction({ id: row.id, color }, csrf()).then(() =>
                      router.refresh(),
                    );
                  }}
                  onDelete={() => void del(row.id)}
                />
              ))}
              {group.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted-foreground">{S.emptyList}</li>
              )}
              <li className="flex items-end gap-2 px-3 py-2">
                <label htmlFor={`new-${target}-label`} className="block flex-1">
                  <span className="mb-1 block text-sm font-medium">{S.labelName}</span>
                  <Input
                    id={`new-${target}-label`}
                    aria-label={`${TARGET_LABEL[target]} ${S.labelName}`}
                    required
                    maxLength={120}
                    value={addName[target] ?? ""}
                    onChange={(e) => setAddName((s) => ({ ...s, [target]: e.target.value }))}
                    className="w-full"
                  />
                </label>
                <div className="block w-32">
                  <span className="mb-1 block text-sm font-medium">{S.color}</span>
                  <LabelColorSelect
                    ariaLabel={`${TARGET_LABEL[target]} ${S.color}`}
                    value={addColor[target] ?? LABEL_COLORS[0]}
                    onChange={(color) => setAddColor((s) => ({ ...s, [target]: color }))}
                  />
                </div>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="px-3"
                  onClick={() => void add(target)}
                >
                  {S.addLabel}
                </Button>
              </li>
            </ul>
          </section>
        );
      })}
    </div>
  );
}
