"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Result } from "@/types/result";

// Generic outcome contract for an inline-editable field's save. `Ok` payload is deliberately
// unused by the hook (it never inspects it), `Err` is a plain string so callers can hand back
// either a stable error id (e.g. ERROR_IDS.DEAL_PRECONDITION) or a human message.
export type InlineSaveResult = Result<unknown, string>;
export type InlineSaveFn<T> = (value: T) => Promise<InlineSaveResult>;

export interface InlineEditField<T> {
  editing: boolean;
  draft: T;
  pending: boolean;
  error: string | null;
  setDraft: (v: T) => void;
  start: () => void;
  cancel: () => void;
  commit: (onSave: InlineSaveFn<T>, valueOverride?: T) => void;
}

// View/edit/pending/error state machine for a single inline-editable field.
//
// `commit` exits edit mode immediately (optimistic, matching the existing EditableTitle/LabelRow
// deal-workspace fields), then runs `onSave` in the background: `pending` covers the async gap
// and `error` surfaces either a `{ ok: false }` Result or a thrown/rejected promise. Because view
// mode always renders the caller's `value` prop (never `draft`), a failed save needs no manual
// revert: the prop simply never advances.
//
// `valueOverride` lets autosave widgets (Select, DatePicker) commit the value their onChange just
// received without a round-trip through `setDraft` first; setting draft and reading it back in
// the same synchronous handler would see the pre-update value (React state updates are not
// applied synchronously), so those callers pass the new value straight to `commit`.
export function useInlineEditField<T>(current: T): InlineEditField<T> {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<T>(current);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against setState-after-unmount if a save is still in flight when the field unmounts.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Re-entering edit mode after a failed save must not clobber the attempted draft: only reset
  // to `current` when there is no live error, so the user does not have to retype a rejected edit.
  const start = useCallback(() => {
    if (error === null) setDraft(current);
    setError(null);
    setEditing(true);
  }, [current, error]);

  const cancel = useCallback(() => {
    setDraft(current);
    setEditing(false);
  }, [current]);

  const commit = useCallback(
    (onSave: InlineSaveFn<T>, valueOverride?: T) => {
      // Serializes commits: a second call while one is still in flight is ignored, so
      // autosave widgets that stay live during the async gap (InlineDateField) cannot fire
      // overlapping onSave calls with nondeterministic pending/error resolution.
      if (pending) return;
      const next = valueOverride !== undefined ? valueOverride : draft;
      setEditing(false);
      if (next === current) return;
      setError(null);
      setPending(true);
      onSave(next)
        .then((result) => {
          if (!mountedRef.current) return;
          setPending(false);
          if (!result.ok) setError(result.error);
        })
        .catch((thrown: unknown) => {
          if (!mountedRef.current) return;
          setPending(false);
          setError(thrown instanceof Error ? thrown.message : String(thrown));
        });
    },
    [draft, current, pending],
  );

  return { editing, draft, pending, error, setDraft, start, cancel, commit };
}
