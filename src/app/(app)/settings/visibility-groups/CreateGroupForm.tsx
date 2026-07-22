"use client";

import { Eye } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { identityErrorMessage } from "@/constants/settingsIdentity";
import { createGroupAction } from "@/features/identity/actions/groups";
import { readCsrfToken } from "@/utils/csrfCookie";

interface Props {
  onCreated: () => void;
}

export function CreateGroupForm({ onCreated }: Props): React.ReactElement {
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
      const result = await createGroupAction(csrf, { name });
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
          <Eye className="size-4" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Create a visibility group</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Control which records a group of users can access.
          </p>
        </div>
      </div>
      <div className="p-5">
        <label htmlFor="group-name" className="sr-only">
          Visibility group name
        </label>
        <Input
          ref={ref}
          id="group-name"
          type="text"
          required
          maxLength={80}
          placeholder="New visibility group name"
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
