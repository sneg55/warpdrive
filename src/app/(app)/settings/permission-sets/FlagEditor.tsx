"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  GLOBAL_FLAGS,
  OWNERSHIP_FLAGS,
  type OwnershipCapability,
  type PermissionFlagKey,
  TEAM_SCOPED_FLAGS,
  type TeamScopedCapability,
} from "@/constants/permissionFlags";
import { IDENTITY_SETTINGS_STRINGS, identityErrorMessage } from "@/constants/settingsIdentity";
import { updateFlagsAction } from "@/features/identity/actions/permission-sets";
import { readCsrfToken } from "@/utils/csrfCookie";

const T = IDENTITY_SETTINGS_STRINGS.flagEditor;

// Ownership capabilities that also expose a _team variant (a team manager acting on a managed
// member's records). Rendered as a third checkbox alongside own/any. Narrows `cap` so the
// `${cap}_team` flag key is statically one of the four valid team-scoped keys.
function isTeamScoped(cap: OwnershipCapability): cap is TeamScopedCapability {
  return (TEAM_SCOPED_FLAGS as readonly OwnershipCapability[]).includes(cap);
}

type FlagMap = Partial<Record<PermissionFlagKey, boolean>>;

interface Props {
  setId: string;
  name: string;
  flags: FlagMap;
  onSaved: () => void;
}

function FlagCheckbox({
  flagKey,
  checked,
  onToggle,
  disabled,
}: {
  flagKey: PermissionFlagKey;
  checked: boolean;
  onToggle: (key: PermissionFlagKey) => void;
  disabled: boolean;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Checkbox
        label={flagKey}
        checked={checked}
        disabled={disabled}
        onCheckedChange={() => onToggle(flagKey)}
      />
      <span>{flagKey}</span>
    </div>
  );
}

export function FlagEditor({ setId, name, flags, onSaved }: Props): React.ReactElement {
  const [current, setCurrent] = useState<FlagMap>(flags);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(key: PermissionFlagKey): void {
    setCurrent((prev) => ({ ...prev, [key]: prev[key] !== true }));
  }

  function save(): void {
    setError(null);
    const csrf = readCsrfToken();
    // Send an explicit boolean for every known key so unchecked flags are cleared, not omitted.
    const complete: Record<string, boolean> = {};
    for (const key of GLOBAL_FLAGS) complete[key] = current[key] === true;
    for (const cap of OWNERSHIP_FLAGS) {
      complete[`${cap}_own`] = current[`${cap}_own`] === true;
      complete[`${cap}_any`] = current[`${cap}_any`] === true;
    }
    for (const cap of TEAM_SCOPED_FLAGS) {
      complete[`${cap}_team`] = current[`${cap}_team`] === true;
    }
    startTransition(async () => {
      const result = await updateFlagsAction(csrf, { setId, flags: complete });
      if (result.ok) {
        onSaved();
      } else {
        setError(identityErrorMessage(result.error));
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold">{name}</h3>
      <div className="grid gap-6 md:grid-cols-2">
        <fieldset>
          <legend className="mb-2 text-xs font-medium uppercase text-gray-500">{T.global}</legend>
          <div className="flex flex-col gap-1.5">
            {GLOBAL_FLAGS.map((key) => (
              <FlagCheckbox
                key={key}
                flagKey={key}
                checked={current[key] === true}
                onToggle={toggle}
                disabled={isPending}
              />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-xs font-medium uppercase text-gray-500">
            {T.ownership}
          </legend>
          <div className="flex flex-col gap-2">
            {OWNERSHIP_FLAGS.map((cap) => (
              <div key={cap} className="flex flex-col gap-1 border-b pb-1.5 last:border-b-0">
                <span className="text-xs text-gray-600">{cap}</span>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  <FlagCheckbox
                    flagKey={`${cap}_own`}
                    checked={current[`${cap}_own`] === true}
                    onToggle={toggle}
                    disabled={isPending}
                  />
                  <FlagCheckbox
                    flagKey={`${cap}_any`}
                    checked={current[`${cap}_any`] === true}
                    onToggle={toggle}
                    disabled={isPending}
                  />
                  {isTeamScoped(cap) && (
                    <FlagCheckbox
                      flagKey={`${cap}_team`}
                      checked={current[`${cap}_team`] === true}
                      onToggle={toggle}
                      disabled={isPending}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button type="button" onClick={save} disabled={isPending}>
          {isPending ? T.saving : T.save}
        </Button>
        {error !== null && (
          <span role="alert" className="text-sm text-red-600">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
