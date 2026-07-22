"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { STRINGS } from "@/constants/strings";
import { reorderDefsAction } from "@/features/custom-fields/actions";
import { moveInArray } from "@/features/settings/reorder";
import { readCsrfToken } from "@/utils/csrfCookie";
import { FieldRowItem } from "./FieldRowItem";
import type { FieldRow } from "./types";

export function FieldList({
  rows,
  footer,
}: {
  rows: FieldRow[];
  footer: React.ReactNode;
}): React.ReactNode {
  const router = useRouter();
  const reportError = useActionError();
  const ids = rows.map((r) => r.id);

  async function move(index: number, direction: "up" | "down"): Promise<void> {
    const next = moveInArray(ids, index, direction);
    if (next[index] === ids[index]) return;
    const r = await reorderDefsAction({ orderedIds: next }, readCsrfToken());
    if (r.ok) router.refresh();
    else reportError(r.error.id);
  }

  return (
    <ul className="divide-y overflow-hidden rounded-lg border bg-card shadow-sm">
      {rows.length === 0 ? (
        <li className="px-3 py-2 text-sm text-muted-foreground">{STRINGS.settings.noFields}</li>
      ) : (
        rows.map((row, index) => (
          <FieldRowItem
            key={row.id}
            row={row}
            isFirst={index === 0}
            isLast={index === rows.length - 1}
            onMove={(direction) => void move(index, direction)}
          />
        ))
      )}
      {footer}
    </ul>
  );
}
