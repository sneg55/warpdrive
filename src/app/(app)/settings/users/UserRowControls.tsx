"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { identityErrorMessage } from "@/constants/settingsIdentity";
import { setUserActiveAction, setUserAdminAction } from "@/features/identity/actions/users";
import { readCsrfToken } from "@/utils/csrfCookie";

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
    <span className="flex flex-col gap-1">
      <span className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={toggleAdmin}
          disabled={isPending}
          aria-label={isAdmin ? "Revoke admin" : "Make admin"}
          className="relative h-8 px-2 text-xs after:absolute after:left-0 after:top-1/2 after:h-10 after:w-full after:-translate-y-1/2 after:content-['']"
        >
          {isAdmin ? "Revoke admin" : "Make admin"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleActive}
          disabled={isPending}
          aria-label={isActive ? "Deactivate" : "Activate"}
          className="relative h-8 px-2 text-xs after:absolute after:left-0 after:top-1/2 after:h-10 after:w-full after:-translate-y-1/2 after:content-['']"
        >
          {isActive ? "Deactivate" : "Activate"}
        </Button>
      </span>
      {error !== null && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
