"use client";

// Send-handler logic extracted from Composer to keep that file under the line cap.
// Both handleSend and handleSendLater share the same draft-state setters and
// activity-creation path; co-locating them here avoids duplication.

import { STRINGS } from "@/constants/strings";
import { createActivityAction } from "@/features/activities/actions";
import { readCsrfToken } from "@/utils/csrfCookie";
import { sendEmail } from "../actions";
import { deleteDraftAction } from "../folderActions";
import { COMPOSER_STRINGS } from "./composer.constants";
import type { ComposerContext } from "./composer.types";

export interface ComposerSendDeps {
  accountId: string;
  resolvedThreadId: string | undefined;
  toList: string[];
  ccList: string[];
  bccList: string[];
  subject: string;
  body: string;
  trackOpens: boolean;
  trackLinks: boolean;
  signatureId: string;
  attachments: { fileId: string }[];
  context: ComposerContext | undefined;
  activityTypes: { id: string; key: string }[];
  addAsActivity: boolean;
  setSending: (v: boolean) => void;
  setError: (v: string | null) => void;
  resetDraft: () => void;
  onSent: (() => void) | undefined;
  // Autosaved draft id shared with useDraftAutosave; deleted once the message is sent.
  draftIdRef: { current: string | undefined };
  // In-flight autosave promise shared with useDraftAutosave; awaited before delete so a save
  // that is still running at send time cannot leave an orphaned draft behind.
  inFlightRef: { current: Promise<void> | null };
}

export function buildSendHandlers(deps: ComposerSendDeps) {
  const {
    accountId,
    resolvedThreadId,
    toList,
    ccList,
    bccList,
    subject,
    body,
    trackOpens,
    trackLinks,
    signatureId,
    attachments,
    context,
    activityTypes,
    addAsActivity,
    setSending,
    setError,
    resetDraft,
    onSent,
    draftIdRef,
    inFlightRef,
  } = deps;

  // Delete the autosaved draft once its message is sent, and clear the shared ref so the
  // trailing autosave tick (fired by resetDraft emptying the composer) is a no-op. Await any
  // in-flight save first: a new-draft save racing the send would otherwise resolve after this
  // and INSERT an orphan (its id was still undefined when we checked).
  async function discardSentDraft(): Promise<void> {
    if (inFlightRef.current !== null) await inFlightRef.current;
    const savedDraftId = draftIdRef.current;
    if (savedDraftId !== undefined) {
      draftIdRef.current = undefined;
      void deleteDraftAction(readCsrfToken(), { draftId: savedDraftId });
    }
  }

  function buildInput(scheduledSendAt?: Date) {
    return {
      accountId,
      idempotencyKey: crypto.randomUUID(),
      to: toList,
      cc: ccList.length > 0 ? ccList : undefined,
      bcc: bccList.length > 0 ? bccList : undefined,
      subject,
      bodyHtml: body,
      threadId: resolvedThreadId,
      trackOpens,
      trackLinks,
      signatureId: signatureId.length > 0 ? signatureId : undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
      scheduledSendAt,
      // Deal-workspace composes carry their deal (and, when known, its primary contact) so a
      // new thread links to THAT deal even when the recipient has several open deals. A plain
      // inbox compose sends neither and falls back to recipient-based auto-linking server-side.
      linkDealId: context?.kind === "deal" ? context.dealId : undefined,
      linkPersonId: context?.kind === "deal" ? context.personId : undefined,
    };
  }

  // Fire-and-forget add-as-activity. Gated on the toggle AND deal context. Subject must be
  // captured by the caller BEFORE resetDraft clears it. Shared by immediate and scheduled sends.
  function fireActivity(capturedSubject: string, scheduled: boolean): void {
    if (!addAsActivity || context?.kind !== "deal") return;

    const emailType = activityTypes.find((t) => t.key === COMPOSER_STRINGS.emailActivityTypeKey);
    const typeId = emailType?.id ?? activityTypes[0]?.id;
    if (typeId === undefined) {
      console.warn(
        "add-as-activity: typeId unavailable (activity types not loaded), activity not created",
      );
      return;
    }

    void createActivityAction(
      {
        typeId,
        subject: capturedSubject,
        priority: null,
        dueAt: null,
        durationMinutes: null,
        dealId: context.dealId,
        personId: context.personId ?? null,
        orgId: context.orgId ?? null,
        guestPersonIds: [],
        participantUserIds: [],
        customFields: {},
      },
      readCsrfToken(),
    ).then((activityResult) => {
      if (!activityResult.ok) {
        const label = scheduled ? "add-as-activity (scheduled)" : "add-as-activity";
        console.warn(`${label} failed after send`, activityResult.error.id);
      }
    });
  }

  function capturedSubjectValue(): string {
    return subject.trim() !== "" ? subject : COMPOSER_STRINGS.defaultActivitySubject;
  }

  async function handleSendLater(scheduledAt: Date): Promise<void> {
    setSending(true);
    setError(null);
    // Capture subject BEFORE resetDraft clears it.
    const capturedSubject = capturedSubjectValue();

    const result = await sendEmail(readCsrfToken(), buildInput(scheduledAt));
    if (!result.ok) {
      setSending(false);
      setError(STRINGS.inbox.errorSend);
      return;
    }

    // Reset immediately so the Send button is disabled before any async activity call.
    resetDraft();
    onSent?.();
    await discardSentDraft();
    setSending(false);

    fireActivity(capturedSubject, true);
  }

  async function handleSend(): Promise<void> {
    setSending(true);
    setError(null);
    // Capture subject BEFORE resetDraft clears it.
    const capturedSubject = capturedSubjectValue();

    const result = await sendEmail(readCsrfToken(), buildInput());
    if (!result.ok) {
      setSending(false);
      setError(STRINGS.inbox.errorSend);
      return;
    }

    // Reset immediately so the Send button is disabled before any async activity call.
    resetDraft();
    onSent?.();
    await discardSentDraft();
    setSending(false);

    fireActivity(capturedSubject, false);
  }

  return { handleSend, handleSendLater };
}
