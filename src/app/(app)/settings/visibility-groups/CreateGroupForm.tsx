"use client";

import { useRef, useState, useTransition } from "react";
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
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-2">
      <div className="flex gap-2">
        <label htmlFor="group-name" className="sr-only">
          Visibility group name
        </label>
        <input
          ref={ref}
          id="group-name"
          type="text"
          required
          maxLength={80}
          placeholder="New visibility group name"
          className="flex-1 rounded border px-3 py-1.5 text-sm"
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white transition-transform active:not-disabled:scale-[0.96] disabled:opacity-50"
        >
          {isPending ? "Creating..." : "Create"}
        </button>
      </div>
      {error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
