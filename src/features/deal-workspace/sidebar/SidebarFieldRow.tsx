"use client";
import type React from "react";
import { useState } from "react";
import { InlineEditFooter } from "@/features/inline-edit/InlineEditFooter";
import { InlineFieldShell } from "@/features/inline-edit/InlineFieldShell";
import { saveErrorMessage } from "@/features/inline-edit/saveError";
import { FieldRow } from "./FieldRow";

interface SidebarFieldRowProps {
  label: string;
  value: React.ReactNode;
  readOnly?: boolean;
  renderEditor?: (args: { draft: string; setDraft: (v: string) => void }) => React.ReactNode;
  initialDraft?: string;
  onSave?: (draft: string) => Promise<{ ok: boolean; errorId?: string }>;
  empty?: boolean;
}

export function SidebarFieldRow({
  label,
  value,
  readOnly = false,
  renderEditor,
  initialDraft = "",
  onSave,
  empty = false,
}: SidebarFieldRowProps): React.ReactNode {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialDraft);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = (): void => {
    setDraft(initialDraft);
    setError(null);
    setEditing(true);
  };

  const cancel = (): void => {
    setError(null);
    setEditing(false);
  };

  const save = (): void => {
    if (onSave === undefined) {
      setEditing(false);
      return;
    }
    setPending(true);
    setError(null);
    onSave(draft)
      .then((result) => {
        setPending(false);
        if (result.ok) {
          setEditing(false);
        } else {
          setError(saveErrorMessage(result.errorId));
        }
      })
      .catch(() => {
        setPending(false);
        setError(saveErrorMessage());
      });
  };

  if (readOnly) {
    return (
      <FieldRow label={label} empty={empty}>
        <span className="block min-w-0 truncate text-left text-sm">{value}</span>
      </FieldRow>
    );
  }

  return (
    <FieldRow label={label} empty={empty}>
      <InlineFieldShell label={label} editing={editing} onStartEdit={start} value={value}>
        <div className="flex flex-col gap-1.5">
          {renderEditor?.({ draft, setDraft })}
          {error !== null ? (
            <span role="alert" className="text-destructive text-xs">
              {error}
            </span>
          ) : null}
          <InlineEditFooter
            onCancel={cancel}
            onSave={save}
            saveDisabled={draft === initialDraft}
            pending={pending}
          />
        </div>
      </InlineFieldShell>
    </FieldRow>
  );
}
