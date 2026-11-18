"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Result } from "@/types/result";

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

export function useInlineEditField<T>(current: T): InlineEditField<T> {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<T>(current);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
