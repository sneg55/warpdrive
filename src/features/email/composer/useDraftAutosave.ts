"use client";

import { useEffect, useRef } from "react";
import { readCsrfToken } from "@/utils/csrfCookie";
import { deleteDraftAction, saveDraftAction } from "../folderActions";

const DEBOUNCE_MS = 1500;

export interface DraftAutosaveDeps {
  accountId: string;
  threadId: string | null;
  subject: string;
  body: string;
  toList: string[];
  ccList: string[];
  initialDraftId: string | undefined;
  // Shared with the send path so delete-on-send targets the id autosave created/resumed.
  draftIdRef: { current: string | undefined };
  // Shared with the send path. Holds the in-flight save promise (null when idle) so concurrent
  // ticks coalesce (no double INSERT) and send can await a racing save before deleting the draft.
  inFlightRef: { current: Promise<void> | null };
}

function hasContent(d: {
  subject: string;
  body: string;
  toList: string[];
  ccList: string[];
}): boolean {
  return (
    d.subject.trim() !== "" || d.body.trim() !== "" || d.toList.length > 0 || d.ccList.length > 0
  );
}

// Debounced autosave (D1). Seeds draftIdRef from a resumed draft on mount. After ~1.5s idle:
// if the composer has content, upsert (create when no id yet, update by id thereafter) and
// record the returned id in the shared ref; if the composer is empty, delete the tracked
// draft and clear the ref. Last-write-wins across tabs (no conflict resolution).
export function useDraftAutosave(deps: DraftAutosaveDeps): void {
  const { accountId, threadId, subject, body, toList, ccList, initialDraftId, draftIdRef } = deps;
  const { inFlightRef } = deps;
  // Seed the shared draft id once. Writing a ref during render is unsafe under concurrent
  // rendering (and react-hooks/refs flags it); this effect is declared before the autosave effect,
  // so the id is in place well before that effect's debounce timer can fire.
  const seeded = useRef(false);
  useEffect(() => {
    if (!seeded.current) {
      draftIdRef.current = initialDraftId;
      seeded.current = true;
    }
  }, [draftIdRef, initialDraftId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      // Skip if a save is already running: it coalesces concurrent ticks (one composition cannot
      // produce two INSERTs), and the next edit reschedules once the in-flight save clears.
      if (inFlightRef.current !== null) return;
      const run = async (): Promise<void> => {
        if (hasContent({ subject, body, toList, ccList })) {
          const res = await saveDraftAction(readCsrfToken(), {
            id: draftIdRef.current,
            accountId,
            threadId,
            subject,
            bodyHtml: body,
            toEmails: toList,
            ccEmails: ccList,
          });
          if (res.ok) draftIdRef.current = res.value.id;
          return;
        }
        const id = draftIdRef.current;
        if (id !== undefined) {
          await deleteDraftAction(readCsrfToken(), { draftId: id });
          draftIdRef.current = undefined;
        }
      };
      inFlightRef.current = run().finally(() => {
        inFlightRef.current = null;
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // Depend on the tracked primitives (and stable refs) only. NOT the deps object literal, whose
    // fresh identity every render would otherwise reset the debounce on any unrelated re-render.
  }, [accountId, threadId, subject, body, toList, ccList, draftIdRef, inFlightRef]);
}
