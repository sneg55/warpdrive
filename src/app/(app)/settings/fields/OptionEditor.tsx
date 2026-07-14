"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { STRINGS } from "@/constants/strings";
import {
  addOptionAction,
  archiveOptionAction,
  renameOptionAction,
} from "@/features/custom-fields/actions";
import type { CustomFieldOption } from "@/types/customFields";
import { readCsrfToken } from "@/utils/csrfCookie";

const S = STRINGS.settings;

export function OptionEditor({
  defId,
  options,
}: {
  defId: string;
  options: CustomFieldOption[];
}): React.ReactNode {
  const router = useRouter();
  const reportError = useActionError();
  const [newLabel, setNewLabel] = useState("");

  async function rename(optionId: string, label: string, previous: string): Promise<void> {
    const trimmed = label.trim();
    // Skip empty or unchanged values so a plain focus/blur does not fire a spurious write + refresh.
    if (trimmed === "" || trimmed === previous) return;
    const r = await renameOptionAction({ id: defId, optionId, label: trimmed }, readCsrfToken());
    if (r.ok) router.refresh();
    else reportError(r.error.id);
  }

  async function remove(optionId: string): Promise<void> {
    const r = await archiveOptionAction({ id: defId, optionId }, readCsrfToken());
    if (r.ok) router.refresh();
    else reportError(r.error.id);
  }

  async function add(): Promise<void> {
    const trimmed = newLabel.trim();
    if (trimmed === "") return;
    const r = await addOptionAction({ id: defId, label: trimmed }, readCsrfToken());
    if (r.ok) {
      setNewLabel("");
      router.refresh();
    } else reportError(r.error.id);
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-2">
      <ul className="space-y-1">
        {options.map((o) => (
          <li key={o.id} className="flex items-center gap-2">
            <input
              aria-label={`${S.optionLabel}: ${o.label}`}
              defaultValue={o.label}
              disabled={o.archived === true}
              maxLength={255}
              onBlur={(e) => void rename(o.id, e.target.value, o.label)}
              className="flex-1 rounded border px-2 py-1 text-sm disabled:opacity-50"
            />
            {o.archived === true ? (
              <span className="text-xs text-muted-foreground">{S.optionArchived}</span>
            ) : (
              <button
                type="button"
                onClick={() => void remove(o.id)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {S.removeOption}
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex items-end gap-2">
        <input
          aria-label={S.newOption}
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          maxLength={255}
          placeholder={S.newOption}
          className="flex-1 rounded border px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={() => void add()}
          className="rounded-md bg-action px-2 py-1 text-xs font-medium text-action-foreground transition-transform hover:opacity-90 active:scale-[0.96]"
        >
          {S.addOption}
        </button>
      </div>
    </div>
  );
}
