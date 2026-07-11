"use client";

import { useState, useTransition } from "react";
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
        <button
          type="button"
          onClick={toggleAdmin}
          disabled={isPending}
          aria-label={isAdmin ? "Revoke admin" : "Make admin"}
          className="rounded border px-2 py-0.5 text-xs transition-transform active:not-disabled:scale-[0.96] disabled:opacity-50"
        >
          {isAdmin ? "Revoke admin" : "Make admin"}
        </button>
        <button
          type="button"
          onClick={toggleActive}
          disabled={isPending}
          aria-label={isActive ? "Deactivate" : "Activate"}
          className="rounded border px-2 py-0.5 text-xs transition-transform active:not-disabled:scale-[0.96] disabled:opacity-50"
        >
          {isActive ? "Deactivate" : "Activate"}
        </button>
      </span>
      {error !== null && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
