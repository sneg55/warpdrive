"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { identityErrorMessage } from "@/constants/settingsIdentity";
import { createPermissionSetAction } from "@/features/identity/actions/permission-sets";
import { readCsrfToken } from "@/utils/csrfCookie";

interface Props {
  onCreated: () => void;
}

export function CreatePermissionSetForm({ onCreated }: Props): React.ReactElement {
  const ref = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const name = ref.current?.value.trim() ?? "";
    if (name.length === 0) return;
    setError(null);
    const csrf = readCsrfToken();
    startTransition(async () => {
      const result = await createPermissionSetAction(csrf, { name });
      if (result.ok) {
        if (ref.current !== null) ref.current.value = "";
        onCreated();
      } else {
        setError(identityErrorMessage(result.error));
      }
    });
  }

  return (
    // Constrained column: the name field is short, so stretching it the full content width read as
    // an unstyled form (matches the Teams create-team treatment).
    <form onSubmit={handleSubmit} className="mt-6 flex max-w-md flex-col gap-2">
      <div className="flex gap-2">
        <label htmlFor="ps-name" className="sr-only">
          Permission set name
        </label>
        <Input
          ref={ref}
          id="ps-name"
          type="text"
          required
          maxLength={80}
          placeholder="New permission set name"
          className="min-w-0 flex-1"
          disabled={isPending}
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create"}
        </Button>
      </div>
      {error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
