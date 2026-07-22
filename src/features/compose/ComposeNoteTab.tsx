"use client";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { createNoteAction } from "@/features/collaboration/actions";
import type { EntityType } from "@/types/entityRef";
import { readCsrfToken } from "@/utils/csrfCookie";
import { useComposeInitialFocus } from "./useComposeInitialFocus";

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
  const noteRef = useComposeInitialFocus<HTMLTextAreaElement>();

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
      <Textarea
        ref={noteRef}
        data-compose-primary="notes"
        aria-label="Note"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Take a note..."
        className="resize-y bg-warning/10 focus-visible:border-ring/50"
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setBody("");
            onCancel?.();
          }}
        >
          Cancel
        </Button>
        <Button disabled={pending} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </div>
  );
}
