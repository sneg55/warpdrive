"use client";
import type React from "react";
import { useState } from "react";
import { createNoteAction } from "@/features/collaboration/actions";
import type { EntityType } from "@/types/entityRef";
import { readCsrfToken } from "@/utils/csrfCookie";

interface Props {
  // Every ComposeScope maps to a valid notes entity type (see noteEntityType in
  // composeScope.ts), so this is never null.
  entityType: EntityType;
  entityId: string;
  onNoteCreated: () => void;
  // Collapses the editor back to its prompt row (Pipedrive behavior).
  onCancel?: () => void;
}

// Notes tab body: inline textarea + Save/Cancel, split out of SharedComposeBar to
// keep that file small.
export function ComposeNoteTab({
  entityType,
  entityId,
  onNoteCreated,
  onCancel,
}: Props): React.ReactNode {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);

  async function save(): Promise<void> {
    const trimmed = body.trim();
    if (trimmed === "") return;
    setPending(true);
    const r = await createNoteAction(
      { entityType, entityId, body: trimmed, pinned: false },
      readCsrfToken(),
    );
    setPending(false);
    if (r.ok) {
      setBody("");
      onNoteCreated();
    }
  }

  return (
    <div className="p-1.5">
      <textarea
        aria-label="Note"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Take a note..."
        className="w-full resize-y rounded-md border bg-warning/10 px-3 py-2 text-sm outline-none focus:border-ring/50"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setBody("");
            onCancel?.();
          }}
          className="rounded-md border px-3 py-1.5 text-sm transition-transform hover:bg-accent active:scale-[0.96]"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void save()}
          className="rounded-md bg-action px-3 py-1.5 text-sm font-medium text-action-foreground transition-transform hover:opacity-90 active:scale-[0.96] disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}
