"use client";

import { MoreHorizontal } from "lucide-react";
import { useState, useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { identityErrorMessage } from "@/constants/settingsIdentity";
import { setUserActiveAction, setUserAdminAction } from "@/features/identity/actions/users";
import { readCsrfToken } from "@/utils/csrfCookie";

const T = {
  menu: "User actions",
  makeAdmin: "Make admin",
  revokeAdmin: "Revoke admin",
  activate: "Activate",
  deactivate: "Deactivate",
} as const;

interface Props {
  userId: string;
  isAdmin: boolean;
  isActive: boolean;
  onChanged: () => void;
}

export function UserRowControls({
  userId,
  isAdmin,
  isActive,
  onChanged,
}: Props): React.ReactElement {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
