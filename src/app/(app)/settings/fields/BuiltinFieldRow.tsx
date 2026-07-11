"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { Switch } from "@/components/ui/Switch";
import type { CustomFieldTarget } from "@/constants/customFieldTypes";
import { STRINGS } from "@/constants/strings";
import { setBuiltinFieldHiddenAction } from "@/features/custom-fields/actions";
import { readCsrfToken } from "@/utils/csrfCookie";
import type { BuiltinRow } from "./types";

const S = STRINGS.settings;

// One built-in field in the Data fields list. Locked identity fields render as a labelled,
// badge-only row (no toggle). Everything else gets a single Hidden switch wired to the gated
// action; a failure surfaces through the shared error reporter (never silent).
export function BuiltinFieldRow({
  entity,
  row,
}: {
  entity: CustomFieldTarget;
  row: BuiltinRow;
}): React.ReactNode {
  const router = useRouter();
  const reportError = useActionError();

  async function toggle(next: boolean): Promise<void> {
    const r = await setBuiltinFieldHiddenAction(
      { entity, key: row.key, hidden: next },
      readCsrfToken(),
    );
    if (r.ok) router.refresh();
    else reportError(r.error.id);
  }

  return (
    <li className="flex items-center gap-2 px-3 py-2 text-sm">
      <span className="font-medium">{row.label}</span>
      <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
        {S.builtinBadge}
      </span>
      <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        {row.locked ? (
          <span>{S.builtinAlwaysShown}</span>
        ) : (
          <>
            <span>{S.builtinHidden}</span>
            <Switch
              checked={row.hidden}
              onCheckedChange={(next) => void toggle(next)}
              label={`${S.builtinHidden}: ${row.label}`}
            />
          </>
        )}
      </span>
    </li>
  );
}
