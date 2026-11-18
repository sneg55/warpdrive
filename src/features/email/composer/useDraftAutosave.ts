"use client";

import { useEffect, useRef } from "react";
import { captureException, currentRoute } from "@/features/observability/capture";
import { readCsrfToken } from "@/utils/csrfCookie";
import { deleteDraftAction, saveDraftAction } from "../folderActions";
import type { EmailVisibility } from "../threadVisibility";

export const DEBOUNCE_MS = 1500;

export interface DraftAutosaveDeps {
  accountId: string;
  threadId: string | null;
  subject: string;
  body: string;
  toList: string[];
  ccList: string[];
  visibility: EmailVisibility;
  linkDealId?: string | undefined;
  linkPersonId?: string | undefined;
  initialDraftId: string | undefined;
  draftIdRef: { current: string | undefined };
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

export function useDraftAutosave(deps: DraftAutosaveDeps): void {
  const { accountId, threadId, subject, body, toList, ccList, initialDraftId, draftIdRef } = deps;
  const { visibility, inFlightRef, linkDealId, linkPersonId } = deps;
  const seeded = useRef(false);
  useEffect(() => {
    if (!seeded.current) {
      draftIdRef.current = initialDraftId;
      seeded.current = true;
    }
  }, [draftIdRef, initialDraftId]);

  useEffect(() => {
    const timer = setTimeout(() => {
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
            visibility,
            linkDealId: linkDealId ?? null,
            linkPersonId: linkPersonId ?? null,
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
      inFlightRef.current = run()
        .catch((e: unknown) => {
          captureException(e, { surface: "email-draft-autosave", route: currentRoute() });
        })
        .finally(() => {
          inFlightRef.current = null;
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    accountId,
    threadId,
    subject,
    body,
    toList,
    ccList,
    visibility,
    linkDealId,
    linkPersonId,
    draftIdRef,
    inFlightRef,
  ]);
}
