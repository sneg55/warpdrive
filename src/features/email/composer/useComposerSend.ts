"use client";

import { unstable_isUnrecognizedActionError } from "next/navigation";
import { ERROR_IDS } from "@/constants/errorIds";
import { createActivityAction } from "@/features/activities/actions";
import { capture, currentRoute } from "@/features/observability/capture";
import { EVENTS } from "@/features/observability/events";
import { readCsrfToken } from "@/utils/csrfCookie";
import { sendEmail } from "../actions";
import { deleteDraftAction } from "../folderActions";
import type { EmailVisibility } from "../threadVisibility";
import { COMPOSER_STRINGS } from "./composer.constants";
import type { ComposerContext } from "./composer.types";
import { sendFailureMessage } from "./sendFailure";

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
  visibility: EmailVisibility;
  signatureId: string;
  attachments: { fileId: string }[];
  context: ComposerContext | undefined;
  linkDealId?: string;
  linkPersonId?: string;
  activityTypes: { id: string; key: string }[];
  addAsActivity: boolean;
  setSending: (v: boolean) => void;
  setError: (v: string | null) => void;
  resetDraft: () => void;
  onSent: (() => void) | undefined;
  draftIdRef: { current: string | undefined };
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
    visibility,
    signatureId,
    attachments,
    context,
    linkDealId,
    linkPersonId,
    activityTypes,
    addAsActivity,
    setSending,
    setError,
    resetDraft,
    onSent,
    draftIdRef,
    inFlightRef,
  } = deps;

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
      visibility,
      signatureId: signatureId.length > 0 ? signatureId : undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
      scheduledSendAt,
      linkDealId: linkDealId ?? (context?.kind === "deal" ? context.dealId : undefined),
      linkPersonId: linkPersonId ?? (context?.kind === "deal" ? context.personId : undefined),
    };
  }

  function fireActivity(capturedSubject: string, scheduled: boolean): void {
    if (!addAsActivity) return;

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
        done: true,
        dueAt: null,
        durationMinutes: null,
        dealId: context?.kind === "deal" ? context.dealId : (linkDealId ?? null),
        personId: (context?.kind === "deal" ? context.personId : linkPersonId) ?? null,
        orgId: context?.kind === "deal" ? (context.orgId ?? null) : null,
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

  function failed(errorId: string, scheduled: boolean): { ok: false; msg: string } {
    capture(EVENTS.actionFailed, {
      errorId,
      surface: "email-send",
      route: currentRoute(),
      scheduled,
    });
    return { ok: false, msg: sendFailureMessage(errorId) };
  }

  async function attemptSend(
    scheduledAt?: Date,
  ): Promise<{ ok: true } | { ok: false; msg: string }> {
    const scheduled = scheduledAt !== undefined;
    try {
      const result = await sendEmail(readCsrfToken(), buildInput(scheduledAt));
      return result.ok ? { ok: true } : failed(result.error.id, scheduled);
    } catch (e) {
      if (unstable_isUnrecognizedActionError(e)) return failed(ERROR_IDS.UI_STALE_BUILD, scheduled);
      console.warn("send action rejected without returning a Result", e);
      return failed(ERROR_IDS.UI_ACTION_UNCONFIRMED, scheduled);
    }
  }

  async function handleSendLater(scheduledAt: Date): Promise<void> {
    setSending(true);
    setError(null);
    const capturedSubject = capturedSubjectValue();

    const result = await attemptSend(scheduledAt);
    if (!result.ok) {
      setSending(false);
      setError(result.msg);
      return;
    }

    resetDraft();
    onSent?.();
    await discardSentDraft();
    setSending(false);

    fireActivity(capturedSubject, true);
  }

  async function handleSend(): Promise<void> {
    setSending(true);
    setError(null);
    const capturedSubject = capturedSubjectValue();

    const result = await attemptSend();
    if (!result.ok) {
      setSending(false);
      setError(result.msg);
      return;
    }

    resetDraft();
    onSent?.();
    await discardSentDraft();
    setSending(false);

    fireActivity(capturedSubject, false);
  }

  return { handleSend, handleSendLater };
}
