"use client";

import { MoreHorizontal } from "lucide-react";
import { useState, useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { identityErrorMessage } from "@/constants/settingsIdentity";
import {
  assignPermissionSetAction,
  setUserActiveAction,
  setUserAdminAction,
} from "@/features/identity/actions/users";
import { readCsrfToken } from "@/utils/csrfCookie";

const T = {
  menu: "User actions",
  makeAdmin: "Make admin",
  revokeAdmin: "Revoke admin",
  activate: "Activate",
  deactivate: "Deactivate",
  changeSet: "Change permission set",
} as const;

interface Props {
  userId: string;
  isAdmin: boolean;
  isActive: boolean;
  viewerIsAdmin: boolean;
  permissionSetId: string | null;
  permissionSets: { id: string; name: string }[];
  onChanged: () => void;
}

export function UserRowControls({
  userId,
  isAdmin,
  isActive,
  viewerIsAdmin,
  permissionSetId,
  permissionSets,
  onChanged,
}: Props): React.ReactElement {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const canAssignSet = permissionSets.length > 0 && (viewerIsAdmin || !isAdmin);

  function toggleAdmin(): void {
    setError(null);
    const csrf = readCsrfToken();
    startTransition(async () => {
      const result = await setUserAdminAction(csrf, { userId, isAdmin: !isAdmin });
      if (result.ok) {
        onChanged();
      } else {
        setError(identityErrorMessage(result.error));
      }
    });
  }

  function assignSet(setId: string): void {
    if (setId === permissionSetId) return;
    setError(null);
    const csrf = readCsrfToken();
    startTransition(async () => {
      const result = await assignPermissionSetAction(csrf, { userId, setId });
      if (result.ok) {
        onChanged();
      } else {
        setError(identityErrorMessage(result.error));
      }
    });
  }

  function toggleActive(): void {
    setError(null);
    const csrf = readCsrfToken();
    startTransition(async () => {
      const result = await setUserActiveAction(csrf, { userId, isActive: !isActive });
      if (result.ok) {
        onChanged();
      } else {
        setError(identityErrorMessage(result.error));
      }
    });
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={T.menu}
          disabled={isPending}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={isPending} onSelect={toggleAdmin}>
            {isAdmin ? T.revokeAdmin : T.makeAdmin}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={isPending} onSelect={toggleActive}>
            {isActive ? T.deactivate : T.activate}
          </DropdownMenuItem>
          {canAssignSet && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={isPending}>{T.changeSet}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-56 min-w-40 overflow-auto">
                <DropdownMenuRadioGroup value={permissionSetId ?? ""} onValueChange={assignSet}>
                  {permissionSets.map((set) => (
                    <DropdownMenuRadioItem key={set.id} value={set.id} disabled={isPending}>
                      {set.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {error !== null && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
