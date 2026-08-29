"use client";

// Send-handler logic extracted from Composer to keep that file under the line cap.
// Both handleSend and handleSendLater share the same draft-state setters and
// activity-creation path; co-locating them here avoids duplication.

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
  // C1: compose privacy, threaded into the send payload so the created thread's visibility matches.
  visibility: EmailVisibility;
  signatureId: string;
  attachments: { fileId: string }[];
  context: ComposerContext | undefined;
  // Inbox compose's deal-linking sidebar (ComposeLinkSidebar). Takes priority over the deal
  // context's own dealId (which only exists for the deal-workspace composer) so a plain inbox
  // compose can still pin the new thread to a picked deal.
  linkDealId?: string;
  // The person the compose is written against (a deal's primary contact, or the person a resumed
  // draft was written for). Resolved by resolveComposerLinks before it reaches here.
  linkPersonId?: string;
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
      // C1: the composer's privacy pick. A NEW thread is created with this visibility; a reply
      // (resolvedThreadId set) inherits the existing thread's visibility server-side.
      visibility,
      signatureId: signatureId.length > 0 ? signatureId : undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
      scheduledSendAt,
      // Deal-workspace composes carry their deal (and, when known, its primary contact) so a
      // new thread links to THAT deal even when the recipient has several open deals. An inbox
      // compose has no deal context but can still pin a deal via ComposeLinkSidebar (the
      // `linkDealId` dep); with neither, the send falls back to recipient-based auto-linking
      // server-side.
      linkDealId: linkDealId ?? (context?.kind === "deal" ? context.dealId : undefined),
      linkPersonId: linkPersonId ?? (context?.kind === "deal" ? context.personId : undefined),
    };
  }

  // Fire-and-forget add-as-activity. Gated on the toggle only: deal context logs a deal-linked
  // activity; an inbox compose falls back to linkDealId (the ComposeLinkSidebar pick, the same
  // value buildInput uses for the email thread link) so add-as-activity stays consistent with
  // the deal the thread was linked to. With neither, the activity is standalone (dealId/personId/
  // orgId null). Subject must be captured by the caller BEFORE resetDraft clears it. Shared by
  // immediate and scheduled sends.
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
        // The email has gone out, so the activity is already done. Logged open it would sit in
        // the dashboard's undated bucket forever: no due date to schedule it by, and nobody
        // goes back to tick off a mail they already sent.
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

  // Every way a send can fail funnels through here, so it is the one place that names the cause
  // and reports it. Before this, a revoked Google grant, a dead session, an unreadable attachment
  // and a page that outlived its deploy all rendered "Failed to send. Please try again." with no
  // telemetry, which left the box logs as the only way to tell them apart.
  function failed(errorId: string, scheduled: boolean): { ok: false; msg: string } {
    capture(EVENTS.actionFailed, {
      errorId,
      surface: "email-send",
      route: currentRoute(),
      scheduled,
    });
    return { ok: false, msg: sendFailureMessage(errorId) };
  }

  // The send action arms its own deadline and can reject rather than return a Result (so can a
  // dropped connection). A rejection means we lost the answer, not that the mail failed, so it
  // keeps its own message. The exception is a rejection Next itself raises for an action id the
  // running build no longer has: that one IS a certain non-send, and retrying in the same tab can
  // never succeed, so it asks for a reload instead.
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
    // Capture subject BEFORE resetDraft clears it.
    const capturedSubject = capturedSubjectValue();

    const result = await attemptSend(scheduledAt);
    if (!result.ok) {
      setSending(false);
      setError(result.msg);
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

    const result = await attemptSend();
    if (!result.ok) {
      setSending(false);
      setError(result.msg);
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
