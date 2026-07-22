"use client";

import { ShieldPlus } from "lucide-react";
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
    <form onSubmit={handleSubmit} className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="flex items-start gap-3 border-b px-5 py-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-muted-foreground">
          <ShieldPlus className="size-4" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Create a permission set</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Bundle access rules that can be assigned to users.
          </p>
        </div>
      </div>
      <div className="p-5">
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
          className="w-full"
          disabled={isPending}
        />
        {error !== null ? (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex justify-end border-t bg-muted/20 px-5 py-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create"}
        </Button>
      </div>
    </form>
  );
}
