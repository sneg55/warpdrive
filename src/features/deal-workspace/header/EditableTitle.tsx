"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { updateDealAction } from "@/features/deals/updateAction";
import { readCsrfToken } from "@/utils/csrfCookie";

interface EditableTitleProps {
  dealId: string;
  title: string;
  // CAS precondition: the deal's updatedAt ISO string.
  expectedUpdatedAt: string;
}

// Click-to-edit deal title (Pipedrive parity). Saves via updateDealAction on blur/Enter, cancels on
// Escape. Only calls the action when the value changed and is non-empty (schema requires 1..255).
export function EditableTitle({
  dealId,
  title,
  expectedUpdatedAt,
}: EditableTitleProps): React.ReactNode {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);

  async function commit(next: string): Promise<void> {
    const trimmed = next.trim();
    setEditing(false);
    if (trimmed === "" || trimmed === title) return;
    setPending(true);
    const r = await updateDealAction(
      { dealId, expectedUpdatedAt, title: trimmed },
      readCsrfToken(),
    );
    setPending(false);
    if (r.ok) router.refresh();
    else router.refresh(); // stale CAS or error: re-sync from the server (reverts the input)
  }

  if (editing) {
    return (
      <input
        // biome-ignore lint/a11y/noAutofocus: inline edit focuses immediately on activation
        autoFocus
        aria-label="Edit deal title"
        defaultValue={title}
        disabled={pending}
        onBlur={(e) => void commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit(e.currentTarget.value);
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full rounded-md border px-2 py-1 text-[25px] font-semibold text-foreground"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label="Edit deal title"
      className="group flex items-center gap-1.5 text-left"
    >
      {/* C1: match the 25px page-title scale (shell PageHeading) while keeping warpdrive's 600 weight. */}
      <h1 className="truncate text-[25px] font-semibold text-foreground">{title}</h1>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
      </svg>
    </button>
  );
}
